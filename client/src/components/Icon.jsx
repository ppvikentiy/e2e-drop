import moon from '../icons/moon.svg?raw';
import sun from '../icons/sun.svg?raw';
import simple from '../icons/a-large-small.svg?raw';
import feather from '../icons/feather.svg?raw';
import back from '../icons/arrow-left.svg?raw';
import pause from '../icons/pause.svg?raw';
import play from '../icons/play.svg?raw';
import maximize from '../icons/maximize.svg?raw';
import stop from '../icons/circle-stop.svg?raw';
import github from '../icons/github.svg?raw';
import home from '../icons/house.svg?raw';
import upload from '../icons/upload.svg?raw';
import download from '../icons/download.svg?raw';
import qr from '../icons/qr-code.svg?raw';
import settings from '../icons/settings.svg?raw';
import close from '../icons/x.svg?raw';
import scan from '../icons/scan-line.svg?raw';
import lock from '../icons/lock-keyhole.svg?raw';
import files from '../icons/files.svg?raw';
import calendar from '../icons/calendar-clock.svg?raw';
import gauge from '../icons/gauge.svg?raw';
import key from '../icons/key-round.svg?raw';
import link from '../icons/link.svg?raw';
import archive from '../icons/file-archive.svg?raw';
import images from '../icons/images.svg?raw';
import devices from '../icons/monitor-smartphone.svg?raw';
import app from '../icons/app-window.svg?raw';
import help from '../icons/circle-help.svg?raw';

// Lucide icons (ISC), kept as SVG assets in src/icons.
const ICONS = {
  moon, sun, simple, feather, back, pause, play, maximize, stop, github, home, upload, download, qr, settings, close, scan,
  lock, files, calendar, gauge, key, link, archive, images, devices, app, help,
};

export default function Icon({ name, size = 18 }) {
  return (
    <span
      className={`icon icon-${name}`}
      style={{ width: size, height: size }}
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: ICONS[name] }}
    />
  );
}
