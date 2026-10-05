const SOURCE = 'https://github.com/ppvikentiy/e2e-drop';

function item(q, a, extra = {}) {
  return { q, a, ...extra };
}

function copy(ru, en, plainRu, plainEn) {
  return { ru, en, plain: { ru: plainRu, en: plainEn } };
}

export const FAQ_SECTIONS = [
  {
    id: 'service',
    title: copy('Сервис', 'The service', 'О сайте', 'About the site'),
    items: [
      item(
        copy(
          'Что такое E2E Drop?',
          'What is E2E Drop?',
          'Что делает этот сайт?',
          'What does this site do?',
        ),
        copy(
          [
            'E2E Drop — это бесплатный и простой файлообменник с упором на конфиденциальность.',
            'Он позволяет быстро и удобно пересылать файлы друг другу без использования сторонних сервисов.',
          ],
          [
            'E2E Drop is a free and simple file-sharing service built around confidentiality.',
            'It lets people send files to each other quickly, without using other services.',
          ],
          [
            'E2E Drop — бесплатный и простой способ переслать файлы.',
            'Им удобно отправить файлы другому человеку. Другие сервисы для этого не нужны.',
          ],
          [
            'E2E Drop is a free and simple way to send files.',
            'It is an easy way to send files to another person. You do not need other services for that.',
          ],
        ),
      ),
      item(
        copy(
          'Нужно ли регистрироваться?',
          'Do I need to sign up?',
          'Нужен ли аккаунт?',
          'Do I need an account?',
        ),
        copy(
          [
            'Регистрации нет. Сервис не спрашивает имя, почту, телефон, геолокацию и платёжные данные: таких полей в протоколе нет.',
            'Профиля, списка ваших раздач и истории получателей тоже нет. Сервер не знает, кто отправил файлы и кто их скачал. Ограничение частоты запросов считается по сетевому адресу и к человеку не привязано.',
            'Сайт не ставит cookie (кроме случая, когда владелец сервиса закрыл его паролем: тогда после входа хранится cookie сессии) и не обращается к другим сайтам. В браузере остаются только ваши настройки и, если отправка оборвалась, черновик этой отправки.',
          ],
          [
            'There is no sign-up. The service does not ask for a name, email, phone number, location, or payment details: the protocol has no such fields.',
            'There is no profile, no list of your transfers, and no history of recipients. The server does not know who sent the files or who downloaded them. Request limits are counted by network address and are not tied to a person.',
            'The site does not set cookies (except when the owner of the service has closed it with a password: then a session cookie is kept after you sign in) and does not call other sites. The browser keeps only your settings and, if an upload was interrupted, a draft of that upload.',
          ],
          [
            'Аккаунт не нужен. Имя, почту и телефон сайт не спрашивает.',
            'Списка ваших отправок нет. Сайт не знает, кто вы. В браузере остаются только настройки и черновик, если отправка оборвалась.',
          ],
          [
            'You do not need an account. The site does not ask for your name, email, or phone number.',
            'There is no list of your sends. The site does not know who you are. The browser keeps only the settings and a draft if a send was interrupted.',
          ],
        ),
      ),
      item(
        copy(
          'Сервис берёт оплату?',
          'Does the service charge money?',
          'Нужно ли платить?',
          'Do I have to pay?',
        ),
        copy(
          [
            'Оплаты в сервисе нет. Нет тарифов, корзины и привязки карты.',
            'Границы технические. В одной раздаче до 10 файлов, каждый до 500 МБ. Срок — 1, 3, 7 или 30 дней с момента публикации. Скачиваний — от 1 до 1000. Пароль можно не ставить.',
          ],
          [
            'The service does not take payment. There are no plans, no checkout, and no card.',
            'The limits are technical. One transfer holds up to 10 files, each up to 500 MB. The time is 1, 3, 7, or 30 days from publication. Downloads run from 1 to 1000. A password is optional.',
          ],
          [
            'Платить не нужно. Карту сайт не просит.',
            'Можно отправить до 10 файлов. Каждый файл — не больше 500 МБ. Хранить их можно от 1 до 30 дней.',
          ],
          [
            'You do not pay. The site does not ask for a card.',
            'You can send up to 10 files. Each file can be up to 500 MB. You can keep them from 1 to 30 days.',
          ],
        ),
      ),
      item(
        copy(
          'Как сменить язык, оформление и шрифт?',
          'How do I change the language, theme, and typeface?',
          'Как поменять язык и вид экрана?',
          'How do I change the language and the screen?',
        ),
        copy(
          [
            'Настройки открываются кнопкой в меню. Там два языка: русский и английский. Выбор остаётся в этом браузере и на сервер не отправляется.',
            'Оформлений четыре. Тёмная и светлая меняют цвета. Простая выключает анимации и эффекты и делает интерфейс спокойнее. Доступная увеличивает текст, говорит простыми словами, выключает анимацию и обводит главное действие; перед показом QR-кодов она предупреждает о мелькании кадров и риске приступа при фоточувствительной эпилепсии. В установленном приложении на телефоне кнопки и панели получают лёгкие блики, зависящие от наклона устройства; в темах Простая и Доступная их нет. Если вы ещё ничего не выбирали, светлая схема системы включает светлую тему, в остальных случаях открывается тёмная.',
            'Шрифт Andika включается отдельным переключателем. Буквы проще отличить друг от друга, цвета темы при этом те же. Без этого переключателя интерфейс набран Roboto и JetBrains Mono.',
          ],
          [
            'Settings open from the menu button. There are two languages, Russian and English. The choice stays in this browser and is not sent to the server.',
            'There are four themes. Dark and light change the colors. Simple turns off animation and effects for a calmer interface. The accessible theme uses larger type, plainer words, no animation, and an outline on the main action; before QR codes are shown it warns about flickering frames and the risk of a seizure in photosensitive epilepsy. In the installed app on a phone, buttons and panels get a light sheen that follows how the device is tilted; the Simple and Accessible themes have none. If you have not chosen yet, a light system scheme selects the light theme; otherwise the site opens in dark.',
            'Andika is a separate switch. The letters are easier to tell apart, and the theme colors stay the same. Without that switch the interface uses Roboto and JetBrains Mono.',
          ],
          [
            'Откройте настройки. Там можно выбрать русский или английский.',
            'Есть тёмный экран, светлый экран, простой экран без движения и крупный текст. Крупный текст говорит простыми словами, и картинка на экране не двигается. Перед показом кодов он предупреждает, что экран мигает.',
            'Отдельно можно включить шрифт, который легче читать. Цвета при этом не меняются.',
          ],
          [
            'Open settings. You can choose Russian or English.',
            'There is a dark screen, a light screen, a simple screen without motion, and large text. Large text uses plain words, and the screen does not move. Before showing codes it warns that the screen flickers.',
            'You can also turn on a font that is easier to read. The colors stay the same.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'crypto',
    title: copy('Шифрование', 'Encryption', 'Как закрываются файлы', 'How files are locked'),
    items: [
      item(
        copy(
          'Как шифруются файлы?',
          'How are the files encrypted?',
          'Как закрываются файлы?',
          'How are the files locked?',
        ),
        copy(
          [
            'Перед отправкой браузер шифрует содержимое файлов по формату VDE2-5pr. Каждый файл делится на сегменты по 4 МиБ. Сегмент закрывается AES-256-GCM отдельным ключом этого файла, к нему добавляется метка подлинности в 16 байт. Метка привязана к раздаче, к файлу и к номеру сегмента, поэтому подмену, перестановку или обрезку сегмента браузер получателя заметит. На сервер уходит только шифртекст содержимого. Сервер сразу пишет его в объектное хранилище и копию на свой диск не кладёт.',
            'Имена, типы и размеры файлов тоже зашифрованы. Вместе с миниатюрами они собираются в описание раздачи, которое браузер отправителя закрывает AES-256-GCM ключом, выведенным из ключа ссылки. Сервер хранит это описание как закрытый блок и прочитать его не может. Если сервер что-то в нём изменит, браузер получателя это обнаружит и ничего не покажет.',
            'Получатель расшифровывает файлы у себя. Браузер сначала открывает описание раздачи, потом забирает шифртекст сегментами, проверяет метку и собирает файл. Если файлов несколько, ZIP собирается уже после расшифровки. Ключа у сервера нет.',
            'В Chrome на Android перед фоновой отправкой файлы тоже сначала шифруются на устройстве. Для этого нужно место примерно на две копии шифртекста с запасом.',
          ],
          [
            'Before the upload, the browser encrypts the file contents in the VDE2-5pr format. Each file is split into 4 MiB segments. Each segment is sealed with AES-256-GCM under that file’s own key, and a 16-byte authenticity tag is added. The tag is bound to the transfer, the file, and the segment number, so the recipient’s browser notices a segment that was changed, reordered, or cut. The server receives only the ciphertext of the contents. It streams that straight into object storage and does not keep a copy on its own disk.',
            'File names, types, and sizes are encrypted too. Together with the thumbnails they form the transfer’s description, which the sender’s browser seals with AES-256-GCM under a key derived from the link key. The server keeps that description as a sealed block and cannot read it. If the server changes anything in it, the recipient’s browser detects it and shows nothing.',
            'The recipient decrypts the files locally. The browser first opens the transfer’s description, then fetches the ciphertext segment by segment, checks each tag, and rebuilds the file. If there are several files, the ZIP is built after decryption. The server does not have the key.',
            'In Chrome on Android, a background upload encrypts the files on the device first. That needs room for about two copies of the ciphertext plus a margin.',
          ],
          [
            'Файлы закрываются у вас в браузере, ещё до отправки. На сайт уходит только закрытая копия. Сайт её не читает.',
            'Имена файлов тоже закрыты. Сайт видит только, сколько файлов и сколько места занимает закрытая копия.',
            'Открывает файлы тот, у кого есть вся ссылка, а если есть пароль — ещё и пароль. Архив из нескольких файлов собирается уже у получателя.',
          ],
          [
            'The files are locked in your browser before they are sent. The site gets only the locked copy. It cannot read that copy.',
            'File names are locked too. The site sees only how many files there are and how much room the locked copy takes.',
            'The files open for the person who has the whole link, and the password too if there is one. An archive of several files is built on the recipient’s side.',
          ],
        ),
      ),
      item(
        copy(
          'Где лежит ключ?',
          'Where is the key?',
          'Где ключ?',
          'Where is the key?',
        ),
        copy(
          [
            'Ключ ссылки — 32 случайных байта. В ссылке это 43 символа после знака #. Браузер не включает эту часть в запросы, поэтому сервер ключ не получает. Из ключа ссылки (и из пароля, если он задан) браузер выводит главный ключ раздачи, а из него — отдельные ключи для каждого файла и ключ подписи описания.',
            'Полная ссылка открывает файлы. Её нужно копировать вместе с хвостом после #. Тот же хвост есть в QR. Если мессенджер обрежет конец, страница покажет «Ошибка расшифровки. Проверьте правильность ссылки»: токен в пути находит раздачу, но содержимое открывается только ключом.',
            'Сервер хранит хэш токена, а не сам токен и не ключ. По копии базы или хранилища ссылку не собрать. Получатель восстановить потерянный ключ не может. У отправителя браузер около 7 часов после публикации помнит токен и ключ ссылки, чтобы снова показать ссылку. Пароль в эту память не входит.',
            'Страница, которую подменили бы вместо настоящего сайта, могла бы прочитать ключ уже в браузере. Установка приложения и сверка с открытым кодом снижают этот риск.',
          ],
          [
            'The link key is 32 random bytes, 43 characters in the link after #. The browser does not put that part into requests, so the server never receives the key. From the link key (and the password, if one is set) the browser derives the transfer’s master key, and from that a separate key for each file and a key for signing the description.',
            'The full link opens the files. Copy it together with the tail after #. The same tail is in the QR. If a messenger cuts the end, the page shows “Decryption failed. Check that the link is correct”: the token in the page path finds the transfer, but the contents open only with the key.',
            'The server stores a hash of the token, not the token and not the key. A copy of the database or the storage does not rebuild the link. The recipient cannot recover a lost key. For about 7 hours after publication the sender’s browser remembers the token and the link key, so it can show the link again. The password is not part of that memory.',
            'A page substituted for the real site could read the key in the browser. Installing the app and checking the published code reduce that risk.',
          ],
          [
            'Ключ стоит в конце ссылки, после знака #. Его нужно копировать вместе со ссылкой. Без этого конца файл не открыть. В коде на экране ключ тоже есть.',
            'Сайт ключ не видит и не хранит. Потерянный конец ссылки вернуть нельзя. Тот, кто отправлял, может снова увидеть ссылку в том же браузере примерно 7 часов.',
          ],
          [
            'The key is at the end of the link, after #. Copy it with the link. Without that end the file will not open. The code on the screen has the key too.',
            'The site does not see the key and does not store it. A lost end of the link cannot be brought back. The person who sent the files can see the link again in the same browser for about 7 hours.',
          ],
        ),
      ),
      item(
        copy(
          'Видит ли сервер содержимое и имена файлов?',
          'Can the server see the contents and the file names?',
          'Сайт видит мои файлы?',
          'Can the site see my files?',
        ),
        copy(
          [
            'Содержимое на сервере — шифртекст. Он лежит в хранилище по служебному пути из двух случайных идентификаторов, с типом «просто байты». Сервер ключа не имеет и расшифровкой не занимается.',
            'Имена, типы, размеры файлов и миниатюры сервер не видит: они лежат в зашифрованном описании раздачи. Сервер знает только, сколько в раздаче файлов и сколько байт шифртекста занимает каждый; по этому числу размер исходного файла можно оценить. Время загрузки файлов сервер не записывает.',
            'В базе также лежат хэш токена и хэш секрета загрузки. Если задан пароль, там же его открытые параметры (соль и число итераций PBKDF2) и SHA-256 от проверочного значения, которое браузер вывел из ключа ссылки и пароля. Сам пароль на сервер не передаётся. По этому хэшу пароль не подобрать: для этого нужен ещё ключ ссылки, которого у сервера нет.',
            'Поставщик хранилища видит объекты в том виде, в котором они записаны: шифртекст и служебный путь.',
          ],
          [
            'What the server holds is ciphertext. It lives in storage under a service path made of two random ids, with the type “plain bytes”. The server does not have the key and does not decrypt.',
            'The server does not see file names, types, sizes, or thumbnails: they sit in the transfer’s encrypted description. The server knows only how many files there are and how many bytes of ciphertext each takes; the original size can be estimated from that number. The server does not record when files were uploaded.',
            'The database also holds a hash of the token and a hash of the upload secret. If a password is set, it also holds the password’s public parameters (the PBKDF2 salt and iteration count) and the SHA-256 of a check value that the browser derived from the link key and the password. The password itself is never sent to the server. The password cannot be guessed from that hash: that would also need the link key, which the server does not have.',
            'The storage provider sees the objects as they were written: ciphertext and a service path.',
          ],
          [
            'Сайт хранит закрытую копию файлов. Имена файлов тоже закрыты.',
            'Ключа у сайта нет. По копии базы ссылку не собрать и файлы не прочитать.',
            'Пароль на сайт не попадает вовсе. Сайт хранит только отпечаток, по которому пароль не узнать.',
          ],
          [
            'The site stores a locked copy of the files. The file names are locked too.',
            'The site does not have the key. A copy of the database cannot rebuild the link or read the files.',
            'The password never reaches the site. The site keeps only a fingerprint that does not reveal the password.',
          ],
        ),
      ),
      item(
        copy(
          'Как пароль связан с шифрованием?',
          'How does the password relate to encryption?',
          'Пароль закрывает файлы?',
          'Does the password lock the files?',
        ),
        copy(
          [
            'Пароль участвует в шифровании. Браузер получает из него ключ функцией PBKDF2-SHA-256 (600 000 итераций, своя случайная соль у каждой раздачи) и смешивает с ключом ссылки. Без пароля файлы не открыть даже по полной ссылке, а без ссылки не поможет и пароль.',
            'Пароль не короче 8 символов. На сервер он не передаётся. Чтобы сервер мог ограничивать подбор, браузер показывает ему проверочное значение, выведенное из ключа ссылки и пароля. Пока оно неверно, сервер не отдаёт ни описание раздачи, ни шифртекст, а после нескольких ошибок замедляет следующие попытки.',
            'Забытый пароль восстановить нельзя: его нет нигде, кроме памяти отправителя и получателя.',
            'При отправке с телефона на компьютер пароль не ставится: ключ уже создал компьютер и положил его в QR.',
          ],
          [
            'The password takes part in encryption. The browser turns it into a key with PBKDF2-SHA-256 (600,000 iterations, a fresh random salt for each transfer) and mixes it with the link key. Without the password the files cannot be opened even with the full link, and without the link the password does not help either.',
            'The password is at least 8 characters long. It is never sent to the server. So that the server can limit guessing, the browser shows it a check value derived from the link key and the password. Until that value is right, the server returns neither the description nor the ciphertext, and after several mistakes it slows down further attempts.',
            'A forgotten password cannot be recovered: it exists only in the memory of the sender and the recipient.',
            'When sending from a phone to a computer, no password is set: the computer already made the key and put it in the QR.',
          ],
          [
            'Да. Без пароля файлы не открыть, даже если есть вся ссылка.',
            'Пароль — не меньше 8 знаков. Сайт его не видит и не хранит, поэтому вернуть забытый пароль нельзя.',
            'При отправке на компьютер пароль не ставится.',
          ],
          [
            'Yes. Without the password the files will not open, even with the whole link.',
            'The password is at least 8 characters. The site does not see it or keep it, so a forgotten password cannot be brought back.',
            'When you send to a computer, you do not set a password.',
          ],
        ),
      ),
      item(
        copy(
          'Шифруется ли передача через QR без интернета?',
          'Is QR transfer without internet encrypted?',
          'Коды без интернета закрывают файл?',
          'Do the offline codes lock the file?',
        ),
        copy(
          [
            'Только если отправитель задал пароль. Тогда данные и имя файла шифруются в его браузере (AES-256-GCM, ключ из пароля через PBKDF2-HMAC-SHA-256), а получатель вводит такой же пароль. Открытыми остаются размер файла, число и длины кусков и параметры вывода ключа.',
            'Без пароля кадры содержат сам файл: имя, тип, размер и куски байтов, а отпечатки кусков содержимое не прячут. Любая камера, которая видит экран, получает те же данные, поэтому держите телефоны рядом и не показывайте коды посторонним. Пароль не короче 8 знаков; короткий пароль можно подобрать по видео кодов. Сервер кадры не видит: до него они не доходят.',
            'Принятый файл остаётся на устройстве получателя, пока его не сохранят или не начнут новую передачу. Новая передача стирает предыдущую незаконченную.',
          ],
          [
            'Only if the sender sets a password. Then the data and the file name are encrypted in the sender’s browser (AES-256-GCM, with a key derived from the password by PBKDF2-HMAC-SHA-256), and the receiver enters the same password. The file size, the number and lengths of the pieces, and the key-derivation parameters stay open.',
            'Without a password the frames contain the file itself: the name, the type, the size, and the pieces of bytes, and the fingerprints of the pieces do not hide the contents. Any camera that can see the screen receives the same data, so keep the phones together and do not show the codes to anyone else. The password must be at least 8 characters; a short one can be guessed from a video of the codes. The server does not see these frames: they never reach it.',
            'The received file stays on the recipient’s device until it is saved or a new transfer starts. A new transfer clears the previous unfinished one.',
          ],
          [
            'Если пароля нет, коды показывают сам файл и его не закрывают. Кто видит экран, тот может снять файл своей камерой. С паролем файл и его имя закрыты.',
            'Держите телефоны рядом. На сайт этот файл не отправляется.',
            'Принятый файл остаётся на телефоне, пока вы его не сохраните. Новая передача стирает старую незаконченную.',
          ],
          [
            'Without a password the codes show the file itself and do not lock it. Anyone who can see the screen can film the file with a camera. With a password the file and its name are locked.',
            'Keep the phones together. This file is not sent to the site.',
            'The received file stays on the phone until you save it. A new transfer clears the old unfinished one.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'send',
    title: copy('Отправка', 'Sending', 'Как отправить', 'How to send'),
    items: [
      item(
        copy(
          'Как отправить файлы?',
          'How do I send files?',
          'Как отправить файлы?',
          'How do I send files?',
        ),
        copy(
          [
            'Откройте «Отправить». Файлы можно выбрать кнопкой или перетащить на поле на главной: главная сразу перенесёт их на страницу отправки.',
            'Дальше задайте срок: 1, 3, 7 или 30 дней. Отсчёт идёт от публикации, то есть от момента, когда загрузка успешно закончилась, а не от выбора файлов. Число скачиваний — 1, 5, 10 или своё, от 1 до 1000.',
            'Пароль можно не включать. Если включили, он должен быть не короче 8 символов, и получателю его нужно сказать отдельно от ссылки. Пароль участвует в шифровании: без него файлы не открыть.',
            'Пока идёт подготовка и загрузка, страницу лучше не закрывать: в большинстве браузеров отправка живёт, только пока вкладка открыта. В Chrome на Android при достаточном свободном месте она может продолжиться после закрытия приложения.',
          ],
          [
            'Open Send. You can pick files with the button or drop them on the field on the home page: the home page carries them to the send page.',
            'Then set the time: 1, 3, 7, or 30 days. The clock starts at publication, when the upload has finished, not when you picked the files. The download count is 1, 5, 10, or a custom number from 1 to 1000.',
            'You can leave the password off. If you turn it on, it must be at least 8 characters, and you tell it to the recipient separately from the link. The password takes part in encryption: without it the files cannot be opened.',
            'While the page prepares and uploads, keep it open: in most browsers the upload lives only while the tab is open. In Chrome on Android, when there is enough free space, it can continue after you close the app.',
          ],
          [
            'Нажмите «Отправить». Выберите файлы. На главной их можно перетащить на поле: откроется та же страница.',
            'Выберите, сколько дней хранить файлы: 1, 3, 7 или 30. Дни считаются после того, как отправка закончилась. Потом выберите, сколько раз файлы можно скачать.',
            'Пароль можно не ставить. Если поставили, скажите его другому человеку отдельно от ссылки.',
            'Пока файлы уходят, страницу лучше не закрывать.',
          ],
          [
            'Tap Send. Choose the files. On the home page you can drop them on the box: the same page opens.',
            'Choose how many days to keep the files: 1, 3, 7, or 30. The days start after sending has finished. Then choose how many times the files can be downloaded.',
            'You can skip the password. If you set one, tell it to the other person separately from the link.',
            'While the files are going, keep the page open.',
          ],
        ),
      ),
      item(
        copy(
          'Сколько файлов можно отправить и какого размера?',
          'How many files can I send, and how large?',
          'Сколько файлов можно отправить?',
          'How many files can I send?',
        ),
        copy(
          [
            'В одной раздаче от 1 до 10 файлов. Каждый файл — до 500 МБ.',
            'Выбираются отдельные файлы. Папку целиком страница не забирает. Если нужно отправить папку, сначала упакуйте её в архив: архив приедет как один файл, а получатель распакует его у себя.',
            'Несколько файлов получатель забирает по одному или одной кнопкой «скачать всё». Архив ZIP собирает браузер получателя.',
            'У фото и видео отправительский браузер может сделать маленькую картинку: сторона не больше 192 пикселей, JPEG не больше 40 КБ. Получатель видит её до скачивания, и это скачивание не считается.',
          ],
          [
            'One transfer holds from 1 to 10 files. Each file can be up to 500 MB.',
            'You pick individual files. The page does not take a whole folder. To send a folder, put it in an archive first: the archive arrives as one file, and the recipient unpacks it locally.',
            'The recipient takes several files one by one, or with one “download all” button. The recipient’s browser builds the ZIP.',
            'For a photo or a video, the sender’s browser can make a small picture: the side is at most 192 pixels, and the JPEG is at most 40 KB. The recipient sees it before downloading, and that view does not count as a download.',
          ],
          [
            'Можно от 1 до 10 файлов. Каждый файл — не больше 500 МБ.',
            'Папку целиком выбрать нельзя. Сначала положите её в архив и отправьте архив.',
            'Несколько файлов можно скачать по одному или все сразу. У фото и видео может быть маленькая картинка. Её просмотр скачивание не тратит.',
          ],
          [
            'You can send from 1 to 10 files. Each file can be up to 500 MB.',
            'You cannot pick a whole folder. Put it in an archive first and send the archive.',
            'Several files can be downloaded one by one or all at once. A photo or video can have a small picture. Looking at it does not use a download.',
          ],
        ),
      ),
      item(
        copy(
          'Что будет, если загрузка прервётся?',
          'What if the upload stops?',
          'Загрузка оборвалась. Что делать?',
          'The upload stopped. What do I do?',
        ),
        copy(
          [
            'Браузер запоминает незаконченную отправку в своей базе на этом устройстве. Там лежат идентификатор раздачи, секрет загрузки, срок, лимит, признак «пароль задан», ключ ссылки и главный ключ раздачи, а по каждому файлу — настоящее имя, размер, дата и сколько байт уже ушло. Главный ключ нужен, чтобы продолжить без повторного ввода пароля, и стирается сразу после публикации. Сам пароль и содержимое файлов туда не пишутся.',
            'Эта запись живёт около 7 часов. На сервере черновик без публикации живёт 6 часов с момента создания. Пока оба срока не вышли, отправку можно продолжить.',
            'Откройте «Отправить» в том же браузере и выберите те же файлы. Сайт сверит их и допишет с места остановки. Если выбрать другие файлы, продолжение не начнётся. Уже целиком принятый файл повторно не записывается.',
            'Если отказаться продолжать, запись в браузере стирается. Если на сервере прошло 6 часов, черновик удалён, и нужно начать новую раздачу. Ссылки у черновика ещё нет: она появляется только после публикации.',
          ],
          [
            'The browser remembers an unfinished upload in its own database on this device. It stores the transfer id, the upload secret, the time, the limit, whether a password was set, the link key and the transfer’s master key, and for each file the real name, size, date, and how many bytes were sent. The master key lets the upload continue without typing the password again, and it is erased as soon as the transfer is published. The password itself and the file contents are not written there.',
            'That record lasts about 7 hours. On the server, a draft that was never published lasts 6 hours from the moment it was created. While both clocks are still running, the upload can continue.',
            'Open Send in the same browser and choose the same files. The site checks them and writes onward from the stopping point. Other files will not resume it. A file that was already accepted in full is not written again.',
            'If you decline to continue, the record in the browser is erased. If 6 hours have passed on the server, the draft is gone and you start a new transfer. A draft has no link yet: the link appears only after publication.',
          ],
          [
            'Если отправка оборвалась, откройте «Отправить» в том же браузере и выберите те же файлы. Она продолжится с места остановки.',
            'Это работает около 7 часов. На сайте черновик живёт 6 часов. Потом нужно начать заново. Содержимое файлов браузер для этого не хранит: он помнит только, сколько уже ушло.',
            'Если выбрать другие файлы, продолжение не начнётся. Ссылки у незаконченной отправки ещё нет.',
          ],
          [
            'If sending stops, open Send in the same browser and choose the same files. It will continue from where it stopped.',
            'This works for about 7 hours. The site keeps the draft for 6 hours. After that, start again. The browser does not keep the file contents for this: it only remembers how much was already sent.',
            'If you choose different files, it will not continue. An unfinished send does not have a link yet.',
          ],
        ),
      ),
      item(
        copy(
          'Можно ли закрыть страницу, пока файлы отправляются?',
          'Can I close the page while files are uploading?',
          'Можно ли закрыть страницу во время отправки?',
          'Can I close the page while sending?',
        ),
        copy(
          [
            'В большинстве браузеров загрузка идёт, только пока страница открыта. Закрытие вкладки обрывает её. Потом её можно продолжить тем же браузером, если не вышли 6 часов на сервере и около 7 часов в браузере.',
            'Отдельный путь есть в Chrome на Android. Если браузер умеет фоновую загрузку, страница управляется службой приложения и на устройстве хватает места, файлы догружает сам браузер, и приложение можно закрыть.',
            'Ссылка в этом случае появляется, когда вы снова откроете приложение. Если фоновую отправку начать нельзя, страница грузит по-обычному и её нужно держать открытой до конца.',
          ],
          [
            'In most browsers the upload runs only while the page is open. Closing the tab stops it. You can continue it later in the same browser, if the server’s 6 hours and the browser’s 7 hours have not run out.',
            'Chrome on Android has a separate path. If the browser can upload in the background, the page is controlled by the app’s service worker, and the device has enough free space, the browser finishes the upload and you can close the app.',
            'In that case the link appears when you open the app again. If a background upload cannot be started, the page uploads in the ordinary way and has to stay open until the end.',
          ],
          [
            'В большинстве браузеров страницу нужно держать открытой, пока файлы не уйдут. Если закрыть её раньше, отправка оборвётся. Потом можно открыть «Отправить» и выбрать те же файлы.',
            'В Chrome на Android приложение иногда можно закрыть: отправка продолжится сама. Ссылка появится, когда вы откроете приложение снова. Если места мало, страницу закрывать нельзя.',
          ],
          [
            'In most browsers, keep the page open until the files have gone. If you close it early, sending stops. You can open Send later and choose the same files.',
            'In Chrome on Android you can sometimes close the app: sending continues on its own. The link appears when you open the app again. If there is little free space, do not close the page.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'receive',
    title: copy('Получение', 'Receiving', 'Как получить', 'How to receive'),
    items: [
      item(
        copy(
          'Как скачать файлы?',
          'How do I download the files?',
          'Как скачать файлы?',
          'How do I download the files?',
        ),
        copy(
          [
            'Откройте ссылку. Страница покажет имена, размеры, срок и сколько скачиваний осталось. У фото и видео может быть миниатюра.',
            'Если отправитель задал пароль, до верного пароля на странице только поле пароля. Списка файлов ещё нет. Пароль сказал отправитель, отдельно от ссылки.',
            'Один файл скачивается как есть. Если загрузка оборвалась, её можно продолжить: браузер запросит недостающий кусок. Несколько файлов можно забрать по одному или все сразу. Во втором случае браузер получателя собирает ZIP.',
            'Файл появляется в папке «Загрузки» браузера.',
          ],
          [
            'Open the link. The page shows the names, sizes, the time left, and how many downloads remain. A photo or video can have a thumbnail.',
            'If the sender set a password, the page shows only the password field until it is correct. There is no file list yet. The sender told you the password separately from the link.',
            'A single file downloads as itself. If the download stops, it can continue: the browser asks for the missing piece. Several files can be taken one by one or all at once. In the second case the recipient’s browser builds a ZIP.',
            'The file appears in the browser’s Downloads folder.',
          ],
          [
            'Откройте ссылку. На странице будут имена файлов, срок и сколько раз их ещё можно скачать.',
            'Если есть пароль, сначала напишите его. Пароль сказал тот, кто отправил файлы.',
            'Один файл скачивается сам. Несколько файлов можно скачать по одному или все вместе. Файл появится в папке «Загрузки».',
          ],
          [
            'Open the link. The page shows the file names, the time, and how many downloads are left.',
            'If there is a password, type it first. The person who sent the files told you the password.',
            'One file downloads by itself. Several files can be downloaded one by one or all together. The file appears in Downloads.',
          ],
        ),
      ),
      item(
        copy(
          'Почему ссылка не открывает файлы?',
          'Why does the link not open the files?',
          'Ссылка не открывается. Почему?',
          'The link does not open. Why?',
        ),
        copy(
          [
            'Чаще всего ссылка обрезана: мессенджер или письмо срезают длинный адрес. Попросите прислать ссылку ещё раз целиком.',
            'Вторая причина — раздача уже не существует. Срок вышел, скачивания закончились, или загрузка так и не была опубликована. У черновика публичной ссылки нет. В этих случаях нужна новая отправка.',
            'Если страница просит принять политику обработки данных, скачивание закрыто, пока вы не нажмёте «Принять». В установленном приложении этот вопрос не задаётся.',
          ],
          [
            'Most often the link was cut: a messenger or an email trims a long address. Ask for the whole link again.',
            'The second cause is that the transfer no longer exists. The time ran out, the downloads were used up, or the upload was never published. A draft has no public link. In these cases you need a new send.',
            'If the page asks you to accept the data policy, downloading stays closed until you tap Accept. The installed app does not ask this question.',
          ],
          [
            'Нужна вся ссылка, до самого конца. Если конец обрезан, файл не откроется. Попросите прислать ссылку ещё раз или картинку с кодом.',
            'Если срок кончился или скачивания закончились, ссылка уже не работает. Попросите отправить файлы заново.',
            'Если сайт просит принять правила, сначала нажмите «Принять». Потом ссылка откроется.',
          ],
          [
            'You need the whole link, all the way to the end. If the end is cut off, the file will not open. Ask for the link again, or for a picture of the code.',
            'If the time is over or the downloads are used up, the link no longer works. Ask for the files to be sent again.',
            'If the site asks you to accept the rules, tap Accept first. Then the link will open.',
          ],
        ),
      ),
      item(
        copy(
          'Повтор и докачка тратят лимит скачиваний?',
          'Do a retry and a resumed download use up the limit?',
          'Докачка тратит скачивание?',
          'Does continuing a download use one up?',
        ),
        copy(
          [
            'Когда страница открылась или пароль подошёл, сервер выдаёт ключ доступа на 24 часа. Внутри случайное число, к IP-адресу ключ не привязан. Первый запрос файла с новым ключом занимает одно скачивание.',
            'Пока действует этот ключ, докачка оборванного файла, остальные файлы раздачи и сборка ZIP лимит не тратят. Можно начать на одном устройстве и продолжить на другом, если это тот же ключ доступа в течение суток.',
            'Новое открытие ссылки запрашивает новый ключ. Первое скачивание после этого снова занимает один раз из лимита. Поэтому ссылку с лимитом в одно скачивание лучше открывать там, где файл точно удастся забрать.',
            'Просмотр миниатюры лимит не увеличивает. Миниатюра приходит вместе с описанием и отдельно как скачивание файла не считается.',
          ],
          [
            'When the page opens or the password is accepted, the server issues an access key for 24 hours. It contains a random number and is not tied to an IP address. The first file request with a new key uses one download.',
            'While that key is valid, resuming a broken file, the other files in the transfer, and building a ZIP do not use the limit. You can start on one device and continue on another if it is the same access key within a day.',
            'Opening the link again asks for a new key. The first download after that uses one more from the limit. A link limited to one download is best opened where you can actually finish saving the file.',
            'Looking at a thumbnail does not increase the limit. The thumbnail arrives with the description and is not counted as a file download.',
          ],
          [
            'Первое скачивание считается. Если файл оборвался, его можно докачать в течение суток. Это не тратит ещё одно скачивание. Остальные файлы из той же ссылки тоже можно забрать.',
            'Если открыть ссылку заново и скачать ещё раз, это может занять новое скачивание. Ссылку с одним скачиванием лучше открывать там, где файл точно сохранится.',
            'Маленькая картинка файла скачивание не тратит.',
          ],
          [
            'The first download counts. If a file stops, you can continue it during the same day. That does not use another download. You can also take the other files from the same link.',
            'If you open the link again and download once more, that can use a new download. A link with one download is best opened where the file will actually be saved.',
            'A small picture of the file does not use a download.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'link',
    title: copy('Ссылка и пароль', 'The link and the password', 'Ссылка и пароль', 'The link and the password'),
    items: [
      item(
        copy(
          'Кто может открыть файлы?',
          'Who can open the files?',
          'Кто может открыть файлы?',
          'Who can open the files?',
        ),
        copy(
          [
            'Файлы открывает полная ссылка. Токен в адресе — 32 случайных байта, в ссылке это 43 символа. Вариантов больше, чем 10⁷⁷, подобрать его перебором нельзя.',
            'Кто скопировал ссылку из чата, письма, буфера или QR, может скачать файлы, пока не вышел срок и не кончился лимит.',
          ],
          [
            'The full link opens the files. The token in the address is 32 random bytes, 43 characters in the link. There are more than 10⁷⁷ possibilities, so guessing it is not realistic.',
            'Whoever copied the link from a chat, an email, the clipboard, or a QR code can download the files until the time runs out and the limit is used up.',
          ],
          [
            'Файлы откроет тот, у кого есть вся ссылка.',
            'Подобрать ссылку нельзя.',
            'Кто увидел ссылку в чате или на картинке с кодом, тоже может скачать файлы, пока срок не кончился.',
          ],
          [
            'The files open for the person who has the whole link.',
            'The link cannot be guessed.',
            'A person who saw the link in a chat or in a picture of the code can also download the files until the time runs out.',
          ],
        ),
      ),
      item(
        copy(
          'Зачем пароль?',
          'Why a password?',
          'Зачем пароль?',
          'Why a password?',
        ),
        copy(
          [
            'Пароль — второй ключ к файлам. Если ссылка попадёт к постороннему, без пароля он файлы не откроет: пароль участвует в шифровании.',
            'Пока пароль неверен, сервер отвечает только «нужен пароль» и параметры для вывода ключа. Имён, размеров и миниатюр в ответе нет. После верного пароля страница получает описание раздачи и доступ на 24 часа.',
            'Пароль не короче 8 символов. На сервер он не уходит ни при отправке, ни при проверке: браузер показывает серверу только проверочное значение, выведенное из ключа ссылки и пароля. Забытый пароль восстановить нельзя.',
            'Скажите пароль получателю отдельно от ссылки: другим сообщением или голосом. Неверные попытки с одного адреса замедляются: первые 5 без задержки, дальше пауза растёт вдвое, до 15 минут. Получатель с другого адреса при этом не блокируется. При отправке с телефона на компьютер по коду пароль не ставится.',
          ],
          [
            'The password is a second key to the files. If the link reaches someone else, they still cannot open the files without the password: it takes part in encryption.',
            'Until the password is correct, the server answers only that a password is required, plus the parameters for deriving the key. The response has no names, sizes, or thumbnails. After the right password, the page receives the transfer’s description and access for 24 hours.',
            'A password is at least 8 characters. It is never sent to the server, neither when sending nor when checking: the browser shows the server only a check value derived from the link key and the password. A forgotten password cannot be recovered.',
            'Tell the recipient the password separately from the link, in another message or by voice. Wrong attempts from one address slow down: the first 5 have no delay, then the pause doubles, up to 15 minutes. A recipient on another address is not locked out by that. When sending from a phone to a computer by a code, no password is set.',
          ],
          [
            'Пароль закрывает сами файлы. Без него они не откроются, даже если ссылка попала к постороннему. Пароль скажите другому человеку отдельно.',
            'Пока пароль неверный, имён файлов на странице нет. Пароль — не меньше 8 знаков. Сайт его не видит и не хранит.',
            'Если несколько раз ввести пароль неправильно, придётся подождать. При отправке на компьютер по коду пароль не ставится.',
          ],
          [
            'The password locks the files themselves. Without it they will not open, even if the link reached someone else. Tell the password to the other person separately.',
            'Until the password is right, the page does not show file names. A password is at least 8 characters. The site does not see it or keep it.',
            'If the password is wrong several times, you have to wait. When you send to a computer with a code, you do not set a password.',
          ],
        ),
      ),
      item(
        copy(
          'Что делать, если ссылка потеряна?',
          'What if the link is lost?',
          'Я потерял ссылку. Что делать?',
          'I lost the link. What do I do?',
        ),
        copy(
          [
            'Получатель восстановить ссылку не может. В базе лежит отпечаток токена, по которому адрес не собрать.',
            'У отправителя ссылка может ещё быть в том же браузере. После публикации браузер около 7 часов помнит её, чтобы снова показать на странице отправки. Пароль в эту память не входит. Если очистить данные сайта или выждать эти часы, запись пропадёт.',
            'Когда локальной копии уже нет, остаётся отправить файлы ещё раз. Старую раздачу это не возвращает.',
          ],
          [
            'The recipient cannot recover the link. The database holds a fingerprint of the token, which cannot rebuild the address.',
            'The sender may still have the link in the same browser. After publication the browser remembers it for about 7 hours, so the send page can show the link again. The password is not part of that memory. Clearing the site data, or waiting those hours out, removes the record.',
            'When the local copy is already gone, the files have to be sent again. That does not bring the old transfer back.',
          ],
          [
            'Тот, кто получил ссылку, вернуть её не может.',
            'Тот, кто отправлял, может снова увидеть ссылку в том же браузере примерно 7 часов. Потом запись пропадает. Тогда файлы нужно отправить ещё раз.',
          ],
          [
            'The person who received the link cannot bring it back.',
            'The person who sent it can see the link again in the same browser for about 7 hours. Then the record goes away. The files then have to be sent again.',
          ],
        ),
      ),
      item(
        copy(
          'Куда безопасно отправлять ссылку?',
          'Where is it safe to send the link?',
          'Кому можно отправлять ссылку?',
          'Who can I send the link to?',
        ),
        copy(
          [
            'Полная ссылка сама открывает файлы. Её место — личное сообщение тому, кто должен их получить.',
            'Общий чат, канал, комментарий и открытый пост увидят другие люди. Ссылка окажется у них тоже, и они смогут скачать файлы, пока раздача жива.',
            'Если вокруг ссылки есть посторонние, включите пароль и передайте его другим каналом.',
            'Браузер просит другие сайты не получать адрес раздачи. Копирование и системное «Поделиться» по вашей команде передают адрес в буфер или в выбранное приложение. Сервер в этом шаге не участвует.',
          ],
          [
            'The full link opens the files by itself. It belongs in a private message to the person who should receive them.',
            'A shared chat, a channel, a comment, or a public post is visible to other people. They then have the link too, and they can download the files while the transfer is alive.',
            'If other people are around the link, turn on a password and send it by another channel.',
            'The browser is asked not to attach the transfer address to requests to other sites. Copying and the system Share menu, when you ask for them, pass the address to the clipboard or to the app you choose. The server is not part of that step.',
          ],
          [
            'Отправьте ссылку только тому, кто должен получить файлы. Личное сообщение подходит. Общий чат — нет: ссылку увидят другие люди.',
            'Код на экране — это та же ссылка. Кто его снял, тот может открыть файлы.',
            'Если рядом есть посторонние, поставьте пароль и скажите его отдельно.',
          ],
          [
            'Send the link only to the person who should get the files. A private message is a good place. A shared chat is not: other people will see the link.',
            'A code on the screen is the same link. Whoever films it can open the files.',
            'If other people are nearby, set a password and tell it separately.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'lifetime',
    title: copy('Срок и удаление', 'Time limit and deletion', 'Когда файлы удаляются', 'When files are deleted'),
    items: [
      item(
        copy(
          'Сколько хранятся файлы?',
          'How long are files kept?',
          'Сколько дней файлы лежат на сайте?',
          'How many days do the files stay?',
        ),
        copy(
          [
            'Срок выбирает отправитель: 1, 3, 7 или 30 дней. Отсчёт начинается в момент публикации, когда все файлы приняты и раздача получила ссылку. Пока идёт загрузка, это ещё черновик: он живёт 6 часов и публичной ссылки не имеет.',
            'Число скачиваний — 1, 5, 10 или своё целое от 1 до 1000. Раздача кончается по тому событию, которое наступит раньше: кончится срок или кончатся скачивания.',
            'Открытие страницы само по себе скачивание не тратит. Его занимает первый запрос файла с новым ключом доступа. Докачка и остальные файлы с тем же ключом в течение 24 часов лимит не увеличивают. Миниатюра тоже не увеличивает.',
          ],
          [
            'The sender chooses the time: 1, 3, 7, or 30 days. The clock starts at publication, when every file has been accepted and the transfer has a link. While the upload is still running, it is a draft: it lives 6 hours and has no public link.',
            'The download count is 1, 5, 10, or a custom whole number from 1 to 1000. The transfer ends at whichever comes first: the time runs out, or the downloads run out.',
            'Opening the page does not by itself use a download. The first file request with a new access key does. Resuming and the other files with the same key within 24 hours do not increase the limit. A thumbnail does not increase it either.',
          ],
          [
            'Вы сами выбираете: 1, 3, 7 или 30 дней. Дни начинаются, когда отправка закончилась и ссылка появилась.',
            'Пока файлы ещё отправляются, ссылки нет. Такой черновик живёт 6 часов.',
            'Скачиваний можно выбрать от 1 до 1000. Файлы исчезнут, когда кончится срок или кончатся скачивания.',
          ],
          [
            'You choose: 1, 3, 7, or 30 days. The days start when sending has finished and the link has appeared.',
            'While the files are still sending, there is no link. That draft lives for 6 hours.',
            'You can choose from 1 to 1000 downloads. The files go away when the time runs out or the downloads run out.',
          ],
        ),
      ),
      item(
        copy(
          'Когда файлы удаляются и можно ли их вернуть?',
          'When are files deleted, and can they come back?',
          'Когда файлы удаляются?',
          'When are the files deleted?',
        ),
        copy(
          [
            'Раздача помечается к удалению, когда вышел срок или число скачиваний достигло лимита. Фоновая задача проверяет это при старте сервера и дальше примерно каждые 10 минут. За один проход она убирает не больше 500 раздач: объекты в хранилище, незавершённые составные загрузки и строки в базе.',
            'Если скачивание уже начинали, удаление может подождать до 24 часов после последнего запроса. Так оборванную загрузку ещё можно докачать. Если скачиваний не было, эти сутки удаление не задерживают.',
            'Вместе с раздачей пропадают файлы, сессии скачивания и привязанный код приёма. Вернуть удалённые файлы нельзя.',
          ],
          [
            'A transfer is marked for deletion when its time has run out or the download count has reached the limit. A background job checks this when the server starts and then about every 10 minutes. In one pass it removes at most 500 transfers: the objects in storage, unfinished multipart uploads, and the rows in the database.',
            'If a download already started, deletion can wait up to 24 hours after the last request. That leaves room to finish a broken download. If there were no downloads, those 24 hours do not delay deletion.',
            'The files, the download sessions, and a paired receive code disappear with the transfer. Deleted files cannot be brought back.',
          ],
          [
            'Файлы удаляются, когда кончается срок или число скачиваний. Проверка идёт примерно каждые 10 минут.',
            'Если скачивание уже началось и оборвалось, файлы могут полежать ещё до суток, чтобы их можно было докачать.',
            'Вернуть удалённые файлы нельзя.',
          ],
          [
            'Files are deleted when the time runs out or the downloads are used up. A check runs about every 10 minutes.',
            'If a download already started and then stopped, the files can stay up to one more day, so they can be finished.',
            'Deleted files cannot be brought back.',
          ],
        ),
      ),
      item(
        copy(
          'Можно ли убрать файлы раньше срока?',
          'Can the files be removed before the time runs out?',
          'Можно ли удалить файлы раньше?',
          'Can I delete the files early?',
        ),
        copy(
          [
            'Срок и лимит задаются до публикации и потом не меняются. Отдельной кнопки «удалить раздачу» на странице готовой ссылки нет.',
            'Чтобы файлы исчезли раньше, при отправке выберите 1 день и одно скачивание. После этого скачивания раздача попадёт в ближайшую очистку. Если скачивание оборвалось, очистка может подождать до 24 часов, чтобы файл можно было докачать.',
            'Неопубликованный черновик и так живёт 6 часов. Если не продолжать загрузку, он удалится сам. Запись в браузере можно убрать сразу, отказавшись продолжать.',
          ],
          [
            'The time and the limit are set before publication and are not changed later. The finished-link page has no separate “delete transfer” button.',
            'To have the files go away sooner, choose 1 day and one download when you send. After that download the transfer joins the next cleanup. If the download was interrupted, cleanup can wait up to 24 hours so the file can be finished.',
            'An unpublished draft already lives only 6 hours. If you do not continue the upload, it is deleted on its own. The record in the browser can be removed at once by declining to continue.',
          ],
          [
            'Кнопки «удалить сейчас» нет. Срок выбирается при отправке.',
            'Чтобы файлы исчезли раньше, выберите 1 день и одно скачивание.',
            'Если отправка ещё не закончилась, она сама пропадёт через 6 часов. В браузере от неё можно отказаться сразу.',
          ],
          [
            'There is no “delete now” button. The time is chosen when you send.',
            'To make the files go away sooner, choose 1 day and one download.',
            'If sending has not finished, it goes away by itself after 6 hours. In the browser you can decline it at once.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'computer',
    title: copy('С телефона на компьютер', 'From a phone to a computer', 'С телефона на компьютер', 'From a phone to a computer'),
    items: [
      item(
        copy(
          'Как отправить файлы с телефона на компьютер?',
          'How do I send files from a phone to a computer?',
          'Как отправить файлы на компьютер?',
          'How do I send files to a computer?',
        ),
        copy(
          [
            'Этот режим нужен, когда файлы на телефоне, а забрать их удобнее на компьютере. На компьютере откройте «Получить». Страница создаёт короткий код и QR.',
            'На телефоне наведите камеру на QR или впишите код руками. Телефон откроет отправку и загрузит файлы. Пароль в этом режиме не задаётся.',
            'Страницу на компьютере держите открытой. Пока телефон отправляет, компьютер видит число файлов, общий размер и сколько байт уже принято. Имён ещё нет. Когда загрузка опубликована, компьютер сам открывает готовую ссылку.',
            'Один код — одна раздача. Уход со страницы приёма стирает код и на компьютере, и на сервере.',
          ],
          [
            'This mode is for files that are on the phone and are easier to collect on a computer. On the computer, open Receive. The page creates a short code and a QR.',
            'On the phone, point the camera at the QR or type the code. The phone opens the send page and uploads the files. A password is not set in this mode.',
            'Keep the computer page open. While the phone is sending, the computer sees the number of files, the total size, and how many bytes have arrived. The names are not there yet. When the upload is published, the computer opens the finished link.',
            'One code belongs to one transfer. Leaving the receive page erases the code on the computer and on the server.',
          ],
          [
            'На компьютере нажмите «Получить». На экране появятся код и квадрат. На телефоне снимите квадрат камерой или напишите код руками.',
            'Телефон отправит файлы на этот компьютер. Пароль здесь не ставится.',
            'Страницу на компьютере не закрывайте. Сначала компьютер видит, сколько уже пришло, но не видит имена. Когда отправка закончится, файлы откроются сами.',
          ],
          [
            'On the computer, tap Receive. A code and a square appear. On the phone, film the square or type the code.',
            'The phone sends the files to this computer. You do not set a password here.',
            'Do not close the computer page. At first the computer sees how much has arrived, but not the names. When sending finishes, the files open by themselves.',
          ],
        ),
      ),
      item(
        copy(
          'Сколько действует код?',
          'How long does the code last?',
          'Сколько работает код?',
          'How long does the code work?',
        ),
        copy(
          [
            'Пока телефон не подключился, код живёт 10 минут. На экране это прямо написано. Если время вышло, на компьютере можно показать новый код.',
            'После того как телефон подключился, код живёт, пока идёт загрузка, но не дольше 6 часов — столько же, сколько черновик раздачи. Один код привязан к одной отправке.',
            'Когда файлы готовы, открытый адрес ссылки ждёт компьютер не дольше 15 минут. Как только компьютер его забрал, строка кода удаляется. То же происходит, если уйти со страницы приёма.',
            'Код состоит из 9 символов, на экране он разбит на группы, например K7M-4QX-9TD. Регистр и дефисы при вводе не важны. Если камера не видит QR, код можно вписать в поле на телефоне. С одного адреса 20 неверных кодов за 15 минут останавливают проверки. Новых кодов можно создать до 30 в час.',
          ],
          [
            'Until the phone connects, the code lives for 10 minutes. The screen says so. If the time runs out, the computer can show a new code.',
            'After the phone connects, the code lives while the upload runs, and no longer than 6 hours — the same lifetime as a draft transfer. One code is tied to one send.',
            'When the files are ready, the open link address waits for the computer for at most 15 minutes. As soon as the computer collects it, the code row is deleted. The same happens if you leave the receive page.',
            'The code is 9 characters, shown in groups, for example K7M-4QX-9TD. Letter case and dashes do not matter when you type it. If the camera cannot see the QR, type the code into the field on the phone. From one address, 20 wrong codes in 15 minutes stop further checks. Up to 30 new codes can be created per hour.',
          ],
          [
            'Код работает 10 минут, пока телефон его не снял. Потом на компьютере можно показать новый.',
            'Когда телефон уже отправляет файлы, код живёт до конца отправки, но не дольше 6 часов.',
            'Если камера не видит код, напишите его руками. Буквы можно писать как угодно, чёрточки не обязательны.',
          ],
          [
            'The code works for 10 minutes, until the phone scans it. Then the computer can show a new one.',
            'Once the phone is sending files, the code lasts until sending finishes, and no longer than 6 hours.',
            'If the camera cannot see the code, type it. The letters can be upper or lower case, and the dashes are optional.',
          ],
        ),
      ),
      item(
        copy(
          'Можно ли поставить пароль при отправке на компьютер?',
          'Can I set a password when sending to a computer?',
          'Можно ли поставить пароль при отправке на компьютер?',
          'Can I set a password when sending to a computer?',
        ),
        copy(
          [
            'Нет. В этом режиме пароль не задаётся.',
            'Компьютер должен оставаться на странице приёма. Закрытие страницы удаляет код.',
          ],
          [
            'No. A password is not set in this mode.',
            'The computer has to stay on the receive page. Closing the page deletes the code.',
          ],
          [
            'Пароль здесь не ставится. Ключ уже есть в коде на компьютере.',
            'Компьютер нужно оставить на этой странице. Если её закрыть, код пропадёт.',
          ],
          [
            'You do not set a password here. The key is already in the code on the computer.',
            'Leave the computer on this page. If you close it, the code goes away.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'offline',
    title: copy('Передача без интернета', 'Transfer without internet', 'Без интернета', 'Without internet'),
    items: [
      item(
        copy(
          'Как передать файл без сети?',
          'How do I transfer a file with no network?',
          'Как передать файл без интернета?',
          'How do I send a file with no internet?',
        ),
        copy(
          [
            'Откройте «Без сети». Один телефон показывает последовательность QR-кодов, другой снимает их камерой. Интернет, сервер и учётная запись в этом не участвуют. Файл не загружается на сайт.',
            'Передаётся один файл. Отправитель выбирает его, размер кодов и скорость. На экране идут кадры. Получатель включает камеру, держит код в рамке и в конце сохраняет файл. Кадры можно потерять, повторить или увидеть не по порядку: недостающие добираются следующими кадрами.',
            'Камера работает по HTTPS и только на этом сайте. Кадры обрабатываются на устройстве и никуда не отправляются. После одной загрузки сайта с сетью этот режим открывается и без интернета, если приложение или оболочка уже сохранены.',
          ],
          [
            'Open Offline. One phone shows a sequence of QR codes, the other reads them with the camera. The internet, the server, and an account are not involved. The file is not uploaded to the site.',
            'One file is transferred. The sender chooses it, the code size, and the speed. Frames run on the screen. The recipient turns the camera on, keeps a code inside the frame, and saves the file at the end. Frames can be lost, repeated, or seen out of order: the missing ones are filled in by later frames.',
            'The camera works over HTTPS and only on this site. Frames are processed on the device and are not sent anywhere. After one online visit, this mode also opens with no internet, once the app or the shell has been saved.',
          ],
          [
            'Откройте «Без интернета». Один телефон показывает коды. Другой снимает их камерой. Интернет не нужен. Файл на сайт не уходит.',
            'Можно передать один файл. Держите оба телефона рядом, пока передача не закончится. Потом нажмите «Сохранить файл».',
            'Камера спросит разрешение. Нажмите «Разрешить». Кадры остаются на телефоне.',
          ],
          [
            'Open No internet. One phone shows codes. The other films them with the camera. You do not need internet. The file does not go to the site.',
            'You can send one file. Keep both phones together until the transfer finishes. Then tap Save file.',
            'The camera will ask permission. Tap Allow. The frames stay on the phone.',
          ],
        ),
      ),
      item(
        copy(
          'Какой размер файла и что делать, если коды плохо читаются?',
          'How large can the file be, and what if the codes are hard to read?',
          'Файл большой, коды плохо читаются. Что делать?',
          'The file is large and the codes are hard to read. What do I do?',
        ),
        copy(
          [
            'Один файл, не больше 512 МБ. На практике удобнее держаться около 150 МБ и меньше: длинная передача чувствительна к свету, дрожи и бликам.',
            'Отправитель выбирает размер кодов. Мелкие идут быстрее и требуют хорошую камеру и яркий экран. Средние подходят большинству телефонов. Крупные надёжнее, если коды срываются. Скорость — от 5 до 30 кадров в секунду. Меньше число — спокойнее и надёжнее, больше — быстрее.',
            'Держите экран ярким, уберите блик, направьте камеру прямо и не уводите код из рамки. Если кадры часто теряются, уменьшите скорость или переключитесь на крупные коды. Экран отправителя не гасите до конца.',
          ],
          [
            'One file, no larger than 512 MB. In practice it is easier around 150 MB or less: a long transfer is sensitive to light, shake, and glare.',
            'The sender chooses the code size. Small codes are faster and need a good camera and a bright screen. Medium codes suit most phones. Large codes are steadier when codes fail. Speed runs from 5 to 30 frames per second. A lower number is calmer and more reliable, a higher number is faster.',
            'Keep the screen bright, remove glare, point the camera straight, and keep the code inside the frame. If frames are often lost, lower the speed or switch to large codes. Do not let the sender’s screen turn off before the end.',
          ],
          [
            'Один файл, не больше 512 МБ. Большой файл идёт долго. Удобнее, когда он меньше 150 МБ.',
            'Если коды плохо читаются, выберите крупные коды и меньшую скорость. Экран сделайте ярким. Держите телефон ровно, код должен быть целиком в рамке.',
          ],
          [
            'One file, no larger than 512 MB. A large file takes a long time. It is easier when the file is under 150 MB.',
            'If the codes are hard to read, choose large codes and a slower speed. Make the screen bright. Hold the phone steady, with the whole code inside the frame.',
          ],
        ),
      ),
      item(
        copy(
          'Как поставить пароль на передачу по QR и ускорить её?',
          'How do I set a password on a QR transfer and make it faster?',
          'Можно ли поставить пароль на передачу по кодам?',
          'Can I put a password on a transfer by codes?',
        ),
        copy(
          [
            'Отправитель может задать пароль не короче 8 знаков до показа кодов. Пароль шифрует данные и имя файла прямо в браузере (AES-256-GCM, ключ из пароля через PBKDF2-HMAC-SHA-256). Получатель вводит такой же пароль до включения камеры. Если он забыл, пароль можно ввести и позже: уже снятые кадры не пропадут. Пароль нигде не сохраняется.',
            'Размер файла, число кусков и параметры вывода ключа остаются открытыми. Короткий пароль можно подобрать по видео кодов, поэтому берите длинный. Без пароля передача не защищена: любая камера рядом получит файл.',
            'Для скорости файл делится на куски, и каждый кусок сжимается gzip, если это выгодно: текст и документы идут заметно быстрее, фото, видео и архивы почти не сжимаются. Режим «Цветные» показывает три кода в одном кадре по каналам красного, зелёного и синего и может дать до трёх раз больше данных за кадр. Он требует хорошей камеры и яркого экрана; если приёмник пишет, что камера плохо различает цвета, переключитесь на обычные коды. Перед приёмом браузер проверяет, хватит ли места на устройстве.',
          ],
          [
            'The sender can set a password of at least 8 characters before showing the codes. The password encrypts the data and the file name in the browser (AES-256-GCM, with a key derived from the password by PBKDF2-HMAC-SHA-256). The receiver enters the same password before switching the camera on. If they forgot, the password can be entered later: the frames already filmed are not lost. The password is never saved.',
            'The file size, the number of pieces, and the key-derivation parameters stay open. A short password can be guessed from a video of the codes, so choose a long one. Without a password the transfer is not protected: any camera nearby gets the file.',
            'For speed the file is split into pieces, and each piece is compressed with gzip when that pays off: text and documents go noticeably faster, photos, video and archives barely compress. The Colour mode shows three codes in one frame, in the red, green and blue channels, and can carry up to three times more data per frame. It needs a good camera and a bright screen; if the receiver says the camera does not tell the colours apart well, switch to normal codes. Before receiving, the browser checks that the device has enough room.',
          ],
          [
            'Перед показом кодов можно написать пароль. Он должен быть не короче 8 знаков. Получатель пишет тот же пароль перед тем, как включить камеру.',
            'Пароль закрывает файл и его имя. Без пароля коды может снять любая камера рядом.',
            'Режим «Цветные (быстрее)» показывает сразу три кода. Нужна хорошая камера и яркий экран. Если приём не идёт, выберите обычные коды.',
          ],
          [
            'You can type a password before showing the codes. It must be at least 8 characters. The receiver types the same password before turning on the camera.',
            'The password locks the file and its name. Without one, any camera nearby can film the codes.',
            'The Colour (faster) mode shows three codes at once. It needs a good camera and a bright screen. If receiving does not move, choose normal codes.',
          ],
        ),
      ),
      item(
        copy(
          'Сохранится ли приём, если обновить страницу?',
          'Does receiving survive a page refresh?',
          'Если обновить страницу, файл пропадёт?',
          'If I refresh the page, does the file disappear?',
        ),
        copy(
          [
            'Незаконченный приём остаётся на устройстве. Уже снятые куски лежат в памяти сайта на этом телефоне, каждый кусок проверен. После обновления страницы приём можно продолжить, снова навёв камеру на коды.',
            'На устройстве хранится одна такая передача. Новая передача удаляет предыдущую незаконченную, даже если та не была сохранена.',
            'Когда файл собран, страница предлагает сохранить его. До сохранения он ещё на устройстве. Очистка данных сайта стирает и незаконченный приём.',
          ],
          [
            'An unfinished receive stays on the device. The pieces already filmed sit in the site’s storage on this phone, and each piece has been checked. After a refresh you can continue by pointing the camera at the codes again.',
            'The device keeps one such transfer. A new transfer deletes the previous unfinished one, even if it was never saved.',
            'When the file is complete, the page offers to save it. Until you save it, it is still on the device. Clearing the site data also erases an unfinished receive.',
          ],
          [
            'Страницу можно обновить. Уже снятые куски останутся. Снова наведите камеру на коды, и приём продолжится.',
            'На телефоне помнится одна незаконченная передача. Новая сотрёт старую.',
            'В конце нажмите «Сохранить файл». Если очистить данные сайта, незаконченный приём пропадёт.',
          ],
          [
            'You can refresh the page. The pieces already filmed stay. Point the camera at the codes again, and receiving continues.',
            'The phone remembers one unfinished transfer. A new one clears the old one.',
            'At the end, tap Save file. If you clear the site data, the unfinished receive goes away.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'app',
    title: copy('Приложение', 'The app', 'Приложение', 'The app'),
    items: [
      item(
        copy(
          'Как установить приложение?',
          'How do I install the app?',
          'Как поставить приложение?',
          'How do I put the app on the screen?',
        ),
        copy(
          [
            'Сайт можно поставить на экран как приложение. Если браузер умеет это предложить, в подвале есть кнопка «Установить приложение».',
            'На iPhone в Safari нажмите «Поделиться», затем «На экран Домой». Подвал подсказывает эти два шага. Отдельного файла из магазина приложений нет: ставится сам сайт.',
            'После установки на Android ссылку Drop можно открывать в приложении. На iOS домашняя иконка открывает сайт, но система не обязана перехватывать все ссылки из других программ.',
          ],
          [
            'The site can be put on the screen as an app. If the browser can offer that, the footer has an Install app button.',
            'On iPhone, in Safari, tap Share, then Add to Home Screen. The footer names those two steps. There is no file from an app store: what is installed is the site itself.',
            'After installation on Android, a Drop link can open in the app. On iOS the home icon opens the site, but the system does not have to catch every link from other apps.',
          ],
          [
            'Внизу страницы может быть кнопка «Поставить приложение». Нажмите её.',
            'На iPhone откройте сайт в Safari. Нажмите «Поделиться», потом «На экран Домой».',
            'Отдельной программы из магазина нет. На экран ставится этот сайт.',
          ],
          [
            'A button at the bottom of the page may say Install the app. Tap it.',
            'On iPhone, open the site in Safari. Tap Share, then Add to Home Screen.',
            'There is no separate program from a store. What goes on the screen is this site.',
          ],
        ),
      ),
      item(
        copy(
          'Работает ли приложение без интернета?',
          'Does the app work without internet?',
          'Приложение открывается без интернета?',
          'Does the app open without internet?',
        ),
        copy(
          [
            'После одной загрузки с сетью оболочка сохраняется на устройстве: страницы, стили и программа чтения QR. Следующий запуск может открыть её из этой копии.',
            'Ссылки на файлы без интернета не работают. Ответы сервера и сами файлы в копию не кладутся. Если сети нет, полоса наверху ведёт в передачу через QR.',
            'Установленное приложение без сети сразу открывает раздел «Без сети», если вы не пришли из меню «Поделиться». Передача кодами после первой загрузки с интернетом работает офлайн.',
          ],
          [
            'After one online visit the shell is saved on the device: the pages, the styles, and the QR reader. The next launch can open it from that copy.',
            'File links do not work without internet. Server answers and the files themselves are not put in the copy. If there is no network, the bar at the top leads to QR transfer.',
            'With no network, the installed app opens the Offline section, unless you arrived from the Share menu. Code transfer works offline after the first online load.',
          ],
          [
            'Сначала откройте сайт с интернетом один раз. Потом страница может открыться и без него.',
            'Ссылки на файлы без интернета не работают. Передача кодами работает.',
            'Если интернета нет, установленное приложение само открывает передачу кодами.',
          ],
          [
            'Open the site with internet once. Then the page can open without it.',
            'File links do not work without internet. Sending with codes does work.',
            'If there is no internet, the installed app opens code transfer by itself.',
          ],
        ),
      ),
      item(
        copy(
          'Как отправить файл из другого приложения на телефоне?',
          'How do I send a file from another app on the phone?',
          'Как отправить файл из другой программы?',
          'How do I send a file from another app?',
        ),
        copy(
          [
            'На Android установленное приложение можно выбрать в меню «Поделиться». Файлы попадают на страницу отправки. Дальше всё как при обычной отправке: срок, лимит, по желанию пароль, затем ссылка.',
            'Если служба приложения ещё не успела принять файлы, сайт перенаправляет на страницу отправки. Новая передача через «Поделиться» заменяет предыдущую, которую вы не открыли.',
            'На iOS такого общего меню у установленного сайта нет. Файл оттуда выбирают уже на странице «Отправить».',
          ],
          [
            'On Android, the installed app can be chosen from the Share menu. The files land on the send page. From there it is an ordinary send: time, limit, an optional password, then the link.',
            'If the app service has not taken the files yet, the site redirects to the send page. A new Share replaces a previous one you had not opened.',
            'On iOS the installed site does not have that shared menu. You pick the file on the Send page instead.',
          ],
          [
            'На Android нажмите «Поделиться» и выберите это приложение. Файлы откроются на странице отправки.',
            'Дальше выберите срок и число скачиваний и дождитесь ссылки.',
            'На iPhone из другой программы так отправить нельзя. Откройте «Отправить» и выберите файл там.',
          ],
          [
            'On Android, tap Share and choose this app. The files open on the send page.',
            'Then choose the time and the number of downloads, and wait for the link.',
            'On iPhone you cannot send from another app this way. Open Send and choose the file there.',
          ],
        ),
      ),
    ],
  },
  {
    id: 'data',
    title: copy('Данные', 'Data', 'Какие данные видит сайт', 'What data the site sees'),
    items: [
      item(
        copy(
          'Какие данные остаются у сайта?',
          'What data does the site keep?',
          'Что сайт про меня запоминает?',
          'What does the site remember about me?',
        ),
        copy(
          [
            'Профиля нет. Сервер хранит служебную запись раздачи: идентификатор, состояние, отпечаток токена, отпечаток секрета загрузки, срок, лимит и счётчик скачиваний. Ещё он хранит зашифрованное описание раздачи (имена, типы, размеры и миниатюры внутри, прочитать их сервер не может) и размер шифртекста каждого файла. Если задан пароль — его открытые параметры и отпечаток проверочного значения, сам пароль сервер не получает. Содержимое файлов лежит в хранилище в зашифрованном виде. Журнал доступа веб-сервера отключён, сетевые адреса никуда не записываются. Ключа ссылки и пароля у сервера нет.',
            'Cookie сайт не ставит, кроме cookie сессии, если владелец закрыл сайт паролем. Страница не обращается к другим сайтам. Имя, почта, телефон, платёжные данные и геолокация не обрабатываются.',
            'В браузере остаются выбранная тема, шрифт, язык и ответ по политике. Если отправка не закончилась, там же черновик: секрет загрузки и прогресс по файлам, без содержимого и без пароля. После публикации эта память ещё около 7 часов может снова показать ссылку.',
            'Код приёма на компьютер и кадры передачи через QR живут отдельно. Код стирается, когда компьютер забрал ссылку или вы ушли со страницы. Кадры QR с устройства не уходят.',
          ],
          [
            'There is no profile. The server keeps the transfer record: an id, a state, a fingerprint of the token, a fingerprint of the upload secret, the time, the limit, and the download counter. It also keeps the transfer’s encrypted description (names, types, sizes, and thumbnails inside, which the server cannot read) and the ciphertext size of each file. If a password is set, it keeps the password’s public parameters and a fingerprint of a check value; the server never receives the password. The file contents sit in storage, encrypted. The web server’s access log is off, and network addresses are not written anywhere. The server has neither the link key nor the password.',
            'The site does not set cookies, except a session cookie when the owner has closed the site with a password. The page does not call other sites. A name, email, phone number, payment details, and location are not processed.',
            'The browser keeps the theme, the typeface, the language, and your answer about the policy. If an upload has not finished, it also keeps a draft: the upload secret and per-file progress, without the contents and without the password. After publication that memory can show the link again for about 7 hours.',
            'The code for receiving on a computer and the frames of a QR transfer live separately. The code is erased when the computer has collected the link or you leave the page. QR frames do not leave the device.',
          ],
          [
            'Аккаунта нет. Сайт помнит закрытую копию файлов, срок и сколько раз их можно скачать. Имена файлов он не видит. Имени и почты он не просит. Cookie нет, если сайт не закрыт паролем. Сетевой адрес нигде не записывается.',
            'В браузере остаются вид экрана, шрифт, язык и ваш ответ на правила. Если отправка оборвалась, браузер помнит, сколько уже ушло. Сами файлы он для этого не хранит.',
            'Полный список написан на странице про данные.',
          ],
          [
            'There is no account. The site remembers a locked copy of the files, the time, and how many times they can be downloaded. It does not see the file names. It does not ask for your name or email. There are no cookies unless the site is closed with a password. Your network address is not written anywhere.',
            'The browser keeps the screen look, the font, the language, and your answer about the rules. If sending was interrupted, the browser remembers how much was already sent. It does not keep the files themselves for that.',
            'The full list is on the data page.',
          ],
        ),
        { to: '/policy' },
      ),
      item(
        copy(
          'Куда записывается IP-адрес?',
          'Where is the IP address written?',
          'Сайт записывает мой сетевой адрес?',
          'Does the site save my network address?',
        ),
        copy(
          [
            'Никуда. IP используется только как ключ счётчика частоты запросов и живёт в памяти процесса: ни в базу, ни в журналы он не пишется. При перезапуске сервера счётчики пропадают. Адрес из заголовка пересылки учитывается только если соединение пришло с самого сервера. Журнал доступа веб-сервера отключён при развёртывании, в журнал ошибок попадают только критические ошибки самого веб-сервера.',
            'С одного адреса можно создать до 30 раздач в час и до 30 кодов приёма в час. Неверный пароль к раздаче замедляет следующие попытки с того же адреса: первые 5 без задержки, дальше пауза удваивается от 2 секунд до 15 минут; кроме того, после 30 неверных паролей за час к любым раздачам замедляется весь адрес. Неверных кодов — до 20 за 15 минут. Верный код в этот счётчик не входит. Опрос статуса кода — до 300 раз в минуту.',
            'Если предел выбран, сайт просит подождать. Журнал приложения пишет ошибки обработки и число удалённых раздач. Тела файлов, пароли и токены в журнал не попадают.',
          ],
          [
            'Nowhere. The IP is used only as the key of a request-rate counter and lives in the process memory: it is written neither to the database nor to logs. When the server restarts, the counters disappear. An address from a forwarding header is used only if the connection came from the server itself. The web server’s access log is turned off at deployment; only critical errors of the web server itself go to its error log.',
            'From one address you can create up to 30 transfers per hour and up to 30 receive codes per hour. A wrong password for a transfer slows down further attempts from the same address: the first 5 have no delay, then the pause doubles from 2 seconds up to 15 minutes; in addition, after 30 wrong passwords in an hour across any transfers, the whole address is slowed down. Wrong codes are limited to 20 in 15 minutes. A correct code is not added to that counter. Code status checks are limited to 300 per minute.',
            'If a limit is reached, the site asks you to wait. The application log records processing errors and how many transfers were deleted. File bodies, passwords, and tokens are not written to the log.',
          ],
          [
            'Нет. Сетевой адрес нужен только, чтобы ограничить число запросов, и живёт в памяти. Ни в базу, ни в журналы он не пишется. После перезапуска сайта счётчик обнуляется.',
            'Если слишком часто создавать отправки, коды или вводить неверный пароль, сайт попросит подождать.',
            'Пароли и файлы в журнал не записываются.',
          ],
          [
            'No. Your network address is used only to limit how often you can ask, and it lives in memory. It is written neither to the database nor to logs. After the site restarts, the counter goes back to zero.',
            'If you create sends or codes too often, or type a wrong password too many times, the site asks you to wait.',
            'Passwords and files are not written to the log.',
          ],
        ),
      ),
      item(
        copy(
          'Где физически хранятся данные и кто выбирает серверы?',
          'Where is the data physically stored, and who chooses the servers?',
          'Где стоят серверы с моими файлами?',
          'Where are the servers with my files?',
        ),
        copy(
          [
            'Это решение для самостоятельного размещения: экземпляр сервиса разворачивает его владелец (Оператор) для своего круга людей. Оператор сам решает, где размещать серверы и хранить данные: выбирает площадку, хостинг-провайдера и поставщика хранилища, и может менять их без предварительного уведомления. База данных, хранилище файлов и серверы приложения могут находиться у разных поставщиков и в разных местах. Конкретные названия в политике не приводятся.',
            'Правила обработки, сроки хранения и пределы, описанные в политике, от места размещения не зависят. Файлы шифруются в вашем браузере до отправки, ключ ссылки и пароль на серверы не попадают, поэтому поставщик хранилища видит только шифртекст.',
            'Если вам не подходит, где стоит этот экземпляр, используйте передачу через QR без интернета: она обходится без сервера.',
          ],
          [
            'This is a self-hosted solution: an instance of the service is deployed by its owner (the Operator) for their own circle of people. The Operator decides where to place the servers and store the data: it chooses the site, the hosting provider, and the storage provider, and may change them without prior notice. The database, the file storage, and the application servers may be with different providers and in different places. The policy does not name specific ones.',
            'The processing rules, retention periods, and limits described in the policy do not depend on where the data are placed. Files are encrypted in your browser before they are sent, and the link key and the password never reach the servers, so the storage provider sees only ciphertext.',
            'If where this instance runs does not suit you, use QR transfer without internet: it works without a server.',
          ],
          [
            'Где стоят серверы, решает хозяин сервиса. Он может поменять это без предупреждения.',
            'Файлы закрываются у вас на телефоне. Ключа у серверов нет, они видят только закрытую копию.',
            'Если вам это не подходит, передайте файл кодами без интернета. Сервер для этого не нужен.',
          ],
          [
            'The owner of the service decides where the servers stand. They can change it without warning.',
            'Files are locked on your phone. The servers do not have the key; they see only a locked copy.',
            'If that does not suit you, send the file with codes and no internet. No server is needed for that.',
          ],
        ),
        { to: '/policy' },
      ),
      item(
        copy(
          'Почему перед отправкой просят принять политику?',
          'Why am I asked to accept the policy before sending?',
          'Почему нужно принять правила?',
          'Why do I have to accept the rules?',
        ),
        copy(
          [
            'Пока политика не принята, страницы отправки, приёма, скачивания и передачи через QR не открываются. Главная, эта страница и текст политики остаются доступны.',
            'Ответ хранится в браузере и на сервер не отправляется. «Не принимать» оставляет передачу выключенной, пока вы не передумаете. В установленном приложении вопрос не задаётся.',
            'Текст политики перечисляет, какие записи реально создаёт программа: что не уходит на сервер, что лежит в базе, что остаётся только в браузере и когда это удаляется.',
          ],
          [
            'Until the policy is accepted, the send, receive, download, and QR-transfer pages stay closed. The home page, this page, and the policy text stay available.',
            'The answer is stored in the browser and is not sent to the server. Declining leaves transfer turned off until you change your mind. The installed app does not ask the question.',
            'The policy text lists the records the program actually creates: what never reaches the server, what sits in the database, what stays only in the browser, and when it is deleted.',
          ],
          [
            'Сначала прочитайте правила и нажмите «Принять». Потом можно отправлять и получать файлы.',
            'Если нажать «Не принимать», отправка останется выключенной. Этот ответ остаётся в браузере и на сайт не уходит.',
            'В установленном приложении этот вопрос не задаётся.',
          ],
          [
            'Read the rules first and tap Accept. Then you can send and receive files.',
            'If you tap Do not accept, sending stays off. That answer stays in the browser and is not sent to the site.',
            'The installed app does not ask this question.',
          ],
        ),
      ),
      item(
        copy(
          'Даёт ли сервис гарантии?',
          'Does the service give any guarantees?',
          'Что если сайт не работает или файл пропал?',
          'What if the site is down or a file is gone?',
        ),
        copy(
          [
            'E2E Drop — решение для самостоятельного размещения: каждый экземпляр разворачивает его владелец (Оператор) для частного круга людей — семьи, друзей, коллег. Это не публичный сервис. Экземпляр предоставляется «как есть», без гарантий бесперебойной работы, отсутствия ошибок и сохранности данных. Оператор вправе приостановить работу сервиса или удалить раздачу: по истечении срока, при исчерпании лимита, при нарушении правил или по техническим причинам.',
            'Ссылку и пароль вы храните сами. Потерянные ключ или пароль восстановить нельзя ни Оператору, ни кому-либо ещё: без ключа шифртекст не прочитать. Для важных файлов держите копию у себя.',
            'Вы отвечаете за то, что отправляете, и за право это отправлять. Оператор не отвечает за убытки и потерю данных, связанные с использованием сервиса. Содержимое, имена и типы файлов зашифрованы ключом, которого у Оператора нет, поэтому прочитать или раскрыть их он не может. Полный текст — в политике.',
          ],
          [
            'E2E Drop is a self-hosted solution: each instance is deployed by its owner (the Operator) for a private circle of people, such as a family, friends, or colleagues. It is not a public service. The instance is provided “as is”, with no guarantee of uninterrupted operation, freedom from errors, or safety of data. The Operator may suspend the service or delete a transfer: when it expires, when its limit is used up, when the rules are broken, or for technical reasons.',
            'You keep the link and the password yourself. A lost key or password cannot be recovered by the Operator or anyone else: without the key the ciphertext cannot be read. Keep a copy of important files yourself.',
            'You are responsible for what you send and for your right to send it. The Operator is not liable for losses or lost data connected with using the service. The contents, names, and types of files are encrypted with a key the Operator does not have, so the Operator can neither read nor disclose them. The full text is in the policy.',
          ],
          [
            'Этот сайт — частный, его владелец держит его для своих. Он работает «как есть»: мы не обещаем, что он всегда будет открыт и что файл не пропадёт.',
            'Ссылку и пароль храните сами. Если потеряете, вернуть их нельзя.',
            'Важные файлы оставьте у себя. Подробности — в политике.',
          ],
          [
            'This site is private: its owner runs it for their own people. It works “as is”: we do not promise that it is always open or that a file will not disappear.',
            'Keep the link and the password yourself. If you lose them, they cannot be recovered.',
            'Keep important files with you. The details are in the policy.',
          ],
        ),
        { to: '/policy' },
      ),
      item(
        copy('Где посмотреть код?', 'Where is the code?', 'Где код сайта?', 'Where is the site code?'),
        copy(
          [
            'Клиент, сервер и передача через QR опубликованы в открытом репозитории. Авторы публикуют исходный код и не предоставляют публичный сервис: каждый экземпляр, включая этот, разворачивает и обслуживает его владелец на собственную ответственность. Подвал сайта показывает версию, тип сборки и номер билда, чтобы страницу можно было сверить со сборкой.',
          ],
          [
            'The client, the server, and the QR transfer are published in an open repository. The authors publish the source code and do not provide a public service: every instance, this one included, is deployed and run by its owner at their own responsibility. The site footer shows the version, the build type, and the build number, so the page can be compared with a build.',
          ],
          [
            'Код сайта открыт. Авторы кода сами сайт не держат: этот сайт запустил его владелец.',
          ],
          [
            'The site code is public. The authors of the code do not run sites themselves: this site was started by its owner.',
          ],
        ),
        {
          href: SOURCE,
          hrefLabel: copy('github.com/ppvikentiy/e2e-drop', 'github.com/ppvikentiy/e2e-drop', 'Открыть код', 'Open the code'),
        },
      ),
    ],
  },
];

export function faqText(field, locale, simple) {
  if (!field) return '';
  if (simple && field.plain?.[locale]) return field.plain[locale];
  return field[locale] || field.ru;
}
