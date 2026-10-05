#Requires -Version 5.1
<#
  E2E Drop — развёртывание на VPS с Windows.
  Запуск: двойной клик по deploy.bat (или: powershell -ExecutionPolicy Bypass -File deploy.ps1)
  Требуется: Windows 10/11 со встроенным OpenSSH-клиентом (ssh, scp) и tar.
#>

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir
$SettingsFile = Join-Path $ScriptDir 'deploy.settings.json'
$KeyPath = Join-Path $env:USERPROFILE '.ssh\e2e_drop_deploy_ed25519'
$RemoteDir = '/tmp/e2e-drop-deploy'
# Unattended run (VD_UNATTENDED=1): nothing is asked. Saved settings are used; the S3 secret key stays as
# on the server; a new site password can come from VD_SITE_PASSWORD. SSH must already accept the deploy key.
$Unattended = ($env:VD_UNATTENDED -eq '1')

function Write-Step([string]$Text) { Write-Host ''; Write-Host "==> $Text" -ForegroundColor Cyan }
function Write-Ok([string]$Text) { Write-Host "    $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    $Text" -ForegroundColor Yellow }

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "ОШИБКА: $Message" -ForegroundColor Red
  exit 1
}

# Runs ssh quietly and returns $true on success. Windows PowerShell 5.1 turns redirected native
# stderr into terminating errors under ErrorActionPreference=Stop, hence the local override.
function Test-Ssh([string[]]$Arguments) {
  $ErrorActionPreference = 'Continue'
  & ssh @Arguments 2>$null | Out-Null
  return ($LASTEXITCODE -eq 0)
}

function Get-SshError([string[]]$Arguments) {
  $ErrorActionPreference = 'Continue'
  $lines = & ssh @Arguments 2>&1 | ForEach-Object { "$_" } | Where-Object { $_.Trim() }
  return (($lines | Select-Object -Last 4) -join "`n")
}

function Read-Value {
  param(
    [string]$Prompt,
    [string]$Default = '',
    [switch]$Secret,
    [switch]$Optional,
    [scriptblock]$Validate,
    [string]$ValidationMessage = 'Некорректное значение'
  )
  while ($true) {
    if ($Unattended) {
      if ($Default) { return $Default }
      if ($Optional -or $Secret) { return '' }
      Fail "Неинтерактивный запуск: нет сохранённого значения для «$Prompt»"
    }
    $label = if ($Default) { "$Prompt [$Default]" } else { $Prompt }
    if ($Secret) {
      $secure = Read-Host -Prompt $label -AsSecureString
      $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
      try { $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
      finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
    } else {
      $value = Read-Host -Prompt $label
    }
    $value = "$value".Trim()
    if (-not $value) { $value = $Default }
    if ($Optional -and $value -eq '-') { return '' }
    if (-not $value) {
      if ($Optional) { return '' }
      Write-Warn 'Значение обязательно'
      continue
    }
    if ($Validate -and -not (& $Validate $value)) { Write-Warn $ValidationMessage; continue }
    return $value
  }
}

function Read-YesNo([string]$Prompt, [bool]$Default = $true) {
  if ($Unattended) { return $Default }
  $hint = if ($Default) { 'Y/n' } else { 'y/N' }
  while ($true) {
    $answer = "$(Read-Host -Prompt "$Prompt ($hint)")".Trim().ToLower()
    if (-not $answer) { return $Default }
    if ($answer -in @('y', 'yes', 'д', 'да')) { return $true }
    if ($answer -in @('n', 'no', 'н', 'нет')) { return $false }
  }
}

function Invoke-Native {
  param([string]$File, [string[]]$Arguments, [string]$ErrorMessage)
  & $File @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "$ErrorMessage (код $LASTEXITCODE)" }
}

function Quote-Sh([string]$Value) { "'" + $Value.Replace("'", "'\''") + "'" }

$tempDir = $null
try {
  Write-Host ''
  Write-Host '=============================================' -ForegroundColor Magenta
  Write-Host '   E2E Drop — развёртывание на сервер' -ForegroundColor Magenta
  Write-Host '=============================================' -ForegroundColor Magenta

  # --- Проверка окружения ------------------------------------------------------
  Write-Step 'Проверка необходимых программ'
  foreach ($tool in 'ssh', 'scp', 'ssh-keygen', 'tar') {
    if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) {
      if ($tool -eq 'tar') { Fail 'Не найден tar.exe. Нужна Windows 10 (1803+) или Windows 11.' }
      Fail ("Не найден $tool. Установите OpenSSH-клиент: Параметры -> Приложения -> Дополнительные компоненты -> " +
        "'Клиент OpenSSH', или в PowerShell от администратора: Add-WindowsCapability -Online -Name OpenSSH.Client~~~~0.0.1.0")
    }
  }
  foreach ($path in 'server\package.json', 'client\package.json', 'deploy\install.sh') {
    if (-not (Test-Path (Join-Path $RepoRoot $path))) { Fail "Не найден файл проекта: $path. Запускайте скрипт из папки deploy проекта." }
  }
  Write-Ok 'ssh, scp, tar найдены'

  # --- Ввод параметров ---------------------------------------------------------
  $saved = @{}
  if (Test-Path $SettingsFile) {
    try {
      (Get-Content $SettingsFile -Raw -Encoding UTF8 | ConvertFrom-Json).PSObject.Properties |
        ForEach-Object { $saved[$_.Name] = "$($_.Value)" }
      Write-Ok 'Загружены сохранённые настройки (Enter — оставить значение в скобках)'
    } catch { Write-Warn 'Не удалось прочитать сохранённые настройки — пропускаю' }
  }
  function Saved([string]$Name, [string]$Fallback = '') { if ($saved.ContainsKey($Name) -and $saved[$Name]) { $saved[$Name] } else { $Fallback } }

  Write-Step 'Подключение к серверу (VPS с Ubuntu/Debian)'
  $hostName = Read-Value 'IP-адрес или имя сервера' (Saved 'Host') -Validate { param($v) $v -match '^[A-Za-z0-9.:-]+$' }
  $port = Read-Value 'SSH-порт' (Saved 'Port' '22') -Validate { param($v) $v -match '^\d{1,5}$' -and [int]$v -le 65535 }
  $user = Read-Value 'Пользователь SSH' (Saved 'User' 'root') -Validate { param($v) $v -match '^[a-z_][a-z0-9_.-]*$' } -ValidationMessage 'Недопустимое имя пользователя'
  Write-Host '    Способ входа: 1 — пароль, 2 — свой SSH-ключ'
  $authMode = Read-Value 'Выберите 1 или 2' (Saved 'AuthMode' '1') -Validate { param($v) $v -in '1', '2' }
  $identity = $KeyPath
  if ($authMode -eq '2') {
    $identity = Read-Value 'Путь к приватному SSH-ключу' (Saved 'KeyFile' (Join-Path $env:USERPROFILE '.ssh\id_ed25519')) `
      -Validate { param($v) Test-Path $v } -ValidationMessage 'Файл не найден'
  }

  Write-Step 'Домен и HTTPS'
  Write-Host '    Оставьте домен пустым (или введите -), чтобы сервис работал по IP (без HTTPS).'
  Write-Host '    Если домен указан — его A-запись должна уже указывать на IP сервера.'
  $domain = Read-Value 'Домен (например drop.example.com)' (Saved 'Domain') -Optional `
    -Validate { param($v) $v -match '^(?=.{1,253}$)([A-Za-z0-9-]+\.)+[A-Za-z]{2,}$' } -ValidationMessage 'Некорректный домен'
  $email = ''
  if ($domain) {
    $email = Read-Value 'E-mail для Let''s Encrypt (пусто — без HTTPS)' (Saved 'Email') -Optional `
      -Validate { param($v) $v -match '^[^@\s'']+@[^@\s'']+\.[^@\s'']+$' } -ValidationMessage 'Некорректный e-mail'
  }

  Write-Step 'S3-совместимое хранилище'
  while ($true) {
    $s3Endpoint = Read-Value 'S3 endpoint (например https://s3.example.com; пусто — Amazon S3)' (Saved 'S3Endpoint') -Optional `
      -Validate { param($v) $v -match '^https?://[^\s'']+$' } -ValidationMessage 'Endpoint должен начинаться с https:// или http://'
    if (-not $s3Endpoint) { break }
    $endpointHost = ([Uri]$s3Endpoint).Host
    try { [void][System.Net.Dns]::GetHostAddresses($endpointHost); break }
    catch {
      Write-Warn "Не удаётся найти хост $endpointHost — возможно, опечатка в адресе."
      if (Read-YesNo 'Использовать этот адрес всё равно?' $false) { break }
      $saved['S3Endpoint'] = ''
    }
  }
  $s3Region = Read-Value 'Регион' (Saved 'S3Region' 'us-east-1') -Validate { param($v) $v -match '^[A-Za-z0-9_-]+$' }
  $s3Bucket = Read-Value 'Имя бакета' (Saved 'S3Bucket') -Validate { param($v) $v -match '^[A-Za-z0-9._-]{3,63}$' }
  $s3Key = Read-Value 'Access Key' (Saved 'S3AccessKey') -Validate { param($v) $v -notmatch "['\s]" }
  $s3Secret = Read-Value 'Secret Key (ввод скрыт; Enter — оставить прежний на сервере)' -Secret -Optional -Validate { param($v) $v -notmatch "['\s]" }
  $pathStyle = Read-YesNo 'Использовать path-style адресацию (рекомендуется для MinIO и большинства S3-совместимых)' ((Saved 'S3PathStyle' 'true') -eq 'true')

  Write-Step 'Пароль на вход в сайт'
  Write-Host '    Если задать пароль, сайт и установленное приложение будут спрашивать его при входе;'
  Write-Host '    без него отправлять, получать и скачивать файлы нельзя. Сам пароль на сервере не хранится — только его хэш.'
  Write-Host '    1 — оставить как сейчас на сервере, 2 — задать новый пароль, 3 — отключить пароль'
  $siteMode = Read-Value 'Выберите 1, 2 или 3' '1' -Validate { param($v) $v -in '1', '2', '3' }
  $sitePassword = ''
  if ($Unattended -and $env:VD_SITE_PASSWORD) {
    if ($env:VD_SITE_PASSWORD.Length -lt 8) { Fail 'VD_SITE_PASSWORD короче 8 символов' }
    $siteMode = '2'
    $sitePassword = $env:VD_SITE_PASSWORD
  }
  if ($siteMode -eq '2' -and -not $sitePassword) {
    while ($true) {
      $sitePassword = Read-Value 'Новый пароль (не короче 8 символов, ввод скрыт)' -Secret -Validate { param($v) $v.Length -ge 8 -and $v -notmatch "[\r\n]" } -ValidationMessage 'Пароль — не короче 8 символов, в одну строку'
      $again = Read-Value 'Повторите пароль' -Secret
      if ($again -ceq $sitePassword) { break }
      Write-Warn 'Пароли не совпали, введите ещё раз'
    }
  }
  $siteModeName = @{ '1' = 'keep'; '2' = 'set'; '3' = 'off' }[$siteMode]

  Write-Step 'Проверьте параметры'
  Write-Host "    Сервер:   $user@${hostName}:$port"
  Write-Host "    Вход:     $(if ($authMode -eq '1') { 'пароль (будет добавлен ключ развёртывания)' } else { "ключ $identity" })"
  Write-Host "    Адрес:    $(if ($domain) { $domain } else { "по IP ($hostName)" })$(if ($email) { ' + HTTPS' })"
  Write-Host "    S3:       $s3Bucket @ $(if ($s3Endpoint) { $s3Endpoint } else { 'Amazon S3' }) ($s3Region)"
  Write-Host "    Пароль:   $(@{ keep = 'на вход в сайт — без изменений'; set = 'на вход в сайт — новый'; off = 'на вход в сайт — отключён' }[$siteModeName])"
  if (-not (Read-YesNo 'Начать развёртывание?')) { Write-Warn 'Отменено'; exit 0 }

  @{
    Host = $hostName; Port = $port; User = $user; AuthMode = $authMode; KeyFile = $(if ($authMode -eq '2') { $identity } else { '' })
    Domain = $domain; Email = $email; S3Endpoint = $s3Endpoint; S3Region = $s3Region; S3Bucket = $s3Bucket
    S3AccessKey = $s3Key; S3PathStyle = $(if ($pathStyle) { 'true' } else { 'false' })
  } | ConvertTo-Json | Set-Content -Path $SettingsFile -Encoding UTF8

  $target = "$user@$hostName"
  $sshBase = @('-p', $port, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=30')
  $sshKeyed = $sshBase + @('-i', $identity, '-o', 'IdentitiesOnly=yes')

  # --- SSH-доступ --------------------------------------------------------------
  Write-Step 'Проверка SSH-подключения'
  $keyWorks = $false
  $usePassword = $false
  function Protect-KeyFile([string]$Path) {
    if ((Test-Path $Path) -and (Get-Command icacls -ErrorAction SilentlyContinue)) {
      try { & icacls $Path /inheritance:r /grant:r "$($env:USERNAME):(R)" 2>&1 | Out-Null } catch {}
    }
  }
  if ($authMode -ne '2') { Protect-KeyFile $KeyPath }
  if (Test-Path $identity) {
    $keyWorks = Test-Ssh ($sshKeyed + @('-o', 'BatchMode=yes', $target, 'true'))
  }
  if (-not $keyWorks) {
    if ($Unattended) { Fail "Сервер не принял ключ $identity. Неинтерактивный запуск не может спросить пароль SSH: добавьте открытый ключ ($identity.pub) в ~/.ssh/authorized_keys на сервере или запустите deploy.bat вручную." }
    if ($authMode -eq '2') {
      Fail "Не удалось войти по ключу $identity. Проверьте адрес, порт, пользователя и что ключ добавлен на сервер."
    }
    if (-not (Test-Path $KeyPath)) {
      New-Item -ItemType Directory -Force -Path (Split-Path $KeyPath) | Out-Null
      $p = Start-Process -FilePath 'ssh-keygen' -ArgumentList "-q -t ed25519 -N `"`" -C e2e-drop-deploy -f `"$KeyPath`"" -NoNewWindow -Wait -PassThru
      if ($p.ExitCode -ne 0 -or -not (Test-Path $KeyPath)) { Fail 'Не удалось создать SSH-ключ' }
      Write-Ok "Создан ключ развёртывания: $KeyPath"
      Protect-KeyFile $KeyPath
    }
    Write-Host '    Сейчас сервер один раз спросит пароль SSH — так на него будет добавлен ключ,'
    Write-Host '    и дальше скрипт будет подключаться без пароля.'
    $pub = (Get-Content "$KeyPath.pub" -Raw).Trim()
    $installKey = 'umask 077; mkdir -p ~/.ssh; chmod 700 ~/.ssh; chmod go-w ~; echo >> ~/.ssh/authorized_keys; ' +
      'tr -d \\015 >> ~/.ssh/authorized_keys; chmod 600 ~/.ssh/authorized_keys; restorecon -R ~/.ssh >/dev/null 2>&1; true'
    $pub | & ssh @sshBase $target $installKey
    if ($LASTEXITCODE -ne 0) { Fail 'Не удалось подключиться к серверу. Проверьте IP, порт, логин и пароль.' }
    if (-not (Test-Ssh ($sshKeyed + @('-o', 'BatchMode=yes', $target, 'true')))) {
      Write-Warn 'Вход по ключу не заработал. Ответ ssh:'
      $why = Get-SshError ($sshKeyed + @('-o', 'BatchMode=yes', '-o', 'LogLevel=ERROR', $target, 'true'))
      if ($why) { $why -split "`n" | ForEach-Object { Write-Warn "  $_" } }
      Write-Warn 'Продолжаю с входом по паролю — сервер спросит пароль несколько раз.'
      $usePassword = $true
    }
  }
  Write-Ok 'SSH-подключение работает'

  $scpArgs = @('-P', $port, '-o', 'StrictHostKeyChecking=accept-new', '-i', $identity, '-o', 'IdentitiesOnly=yes', '-q')
  if ($usePassword) {
    $sshKeyed = $sshBase + @('-o', 'PubkeyAuthentication=no', '-o', 'PreferredAuthentications=password,keyboard-interactive')
    $scpArgs = @('-P', $port, '-o', 'StrictHostKeyChecking=accept-new', '-o', 'PubkeyAuthentication=no', '-q')
  }
  $batch = if ($usePassword) { @() } else { @('-o', 'BatchMode=yes') }

  $isRoot = $user -eq 'root'
  if (-not $isRoot) {
    if (-not (Test-Ssh ($sshKeyed + $batch + @($target, 'command -v sudo')))) { Fail "На сервере нет sudo, а пользователь $user не root. Подключитесь как root." }
  }

  # --- Упаковка ----------------------------------------------------------------
  Write-Step 'Упаковка проекта'
  $tempDir = Join-Path ([IO.Path]::GetTempPath()) ("e2e-drop-deploy-" + [Guid]::NewGuid().ToString('N').Substring(0, 8))
  New-Item -ItemType Directory -Path $tempDir | Out-Null
  $archive = Join-Path $tempDir 'app.tgz'

  # Build number shown in the site footer: git commit count + short hash when git is available.
  $buildInfoPath = Join-Path $RepoRoot 'client\build-info.json'
  Remove-Item $buildInfoPath -ErrorAction SilentlyContinue
  if (Get-Command git -ErrorAction SilentlyContinue) {
    $ErrorActionPreference = 'Continue'
    $buildNumber = "$(& git -C $RepoRoot rev-list --count HEAD 2>$null)".Trim()
    $buildCommit = "$(& git -C $RepoRoot rev-parse --short HEAD 2>$null)".Trim()
    $ErrorActionPreference = 'Stop'
    if ($buildNumber -match '^\d+$') {
      @{ number = $buildNumber; commit = $buildCommit } | ConvertTo-Json -Compress |
        Set-Content -Path $buildInfoPath -Encoding ASCII
      Write-Ok "Билд $buildNumber ($buildCommit)"
    }
  }

  Invoke-Native 'tar' @('--exclude=node_modules', '--exclude=dist', '--exclude=.env', '-czf', $archive, '-C', $RepoRoot,
    'server', 'client', 'vqd', 'deploy/install.sh') 'Не удалось упаковать проект'
  Write-Ok ("Архив: {0:N1} МБ" -f ((Get-Item $archive).Length / 1MB))

  $envLines = @(
    "DOMAIN=$(Quote-Sh $domain)"
    "LE_EMAIL=$(Quote-Sh $email)"
    "S3_ENDPOINT=$(Quote-Sh $s3Endpoint)"
    "S3_REGION=$(Quote-Sh $s3Region)"
    "S3_BUCKET=$(Quote-Sh $s3Bucket)"
    "S3_ACCESS_KEY=$(Quote-Sh $s3Key)"
    "S3_SECRET_KEY=$(Quote-Sh $s3Secret)"
    "S3_FORCE_PATH_STYLE=$(if ($pathStyle) { "'true'" } else { "'false'" })"
    "SITE_PASSWORD_MODE='$siteModeName'"
    "SITE_PASSWORD=$(Quote-Sh $sitePassword)"
  )
  $envFile = Join-Path $tempDir 'deploy.env'
  [IO.File]::WriteAllText($envFile, (($envLines -join "`n") + "`n"), [Text.UTF8Encoding]::new($false))

  # --- Загрузка на сервер ------------------------------------------------------
  Write-Step 'Загрузка файлов на сервер'
  Invoke-Native 'ssh' ($sshKeyed + @($target, "rm -rf $RemoteDir && mkdir -p $RemoteDir && chmod 700 $RemoteDir")) 'Не удалось создать временную папку на сервере'
  Invoke-Native 'scp' ($scpArgs + @($archive, $envFile, "${target}:$RemoteDir/")) 'Не удалось передать файлы на сервер'
  Write-Ok 'Файлы загружены'

  # --- Установка ---------------------------------------------------------------
  Write-Step 'Установка на сервере (это может занять несколько минут)'
  if (-not $isRoot) { Write-Host '    Если сервер спросит пароль для sudo — введите пароль пользователя.' }
  $sudo = if ($isRoot) { '' } else { 'sudo ' }
  $remoteCmd = "cd $RemoteDir && tar -xzf app.tgz && sed -i 's/\r$//' deploy/install.sh && " +
    "${sudo}bash deploy/install.sh $RemoteDir/deploy.env; rc=`$?; ${sudo}rm -rf $RemoteDir; exit `$rc"
  & ssh @sshKeyed -t $target $remoteCmd
  if ($LASTEXITCODE -ne 0) {
    Fail ('Установка на сервере завершилась с ошибкой (см. сообщения выше). ' +
      'Полный лог на сервере: /var/log/e2e-drop-install.log. Исправьте причину и запустите deploy.bat снова — ' +
      'повторный запуск безопасен.')
  }

  Write-Host ''
  Write-Host 'Развёртывание завершено успешно!' -ForegroundColor Green
  $url = if ($domain) { $domain } else { $hostName }
  Write-Host "Откройте в браузере: $(if ($email) { 'https' } else { 'http' })://$url/" -ForegroundColor Green
  exit 0
}
catch {
  Write-Host ''
  Write-Host "Непредвиденная ошибка: $($_.Exception.Message)" -ForegroundColor Red
  Write-Host $_.ScriptStackTrace -ForegroundColor DarkGray
  exit 1
}
finally {
  if ($tempDir -and (Test-Path $tempDir)) { Remove-Item -Recurse -Force $tempDir -ErrorAction SilentlyContinue }
}
