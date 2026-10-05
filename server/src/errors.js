export class HttpError extends Error {
  constructor(status, message, reason) {
    super(message);
    this.status = status;
    if (reason) this.reason = reason;
  }
}

const SQLSTATE_AUTH = new Set(['28P01', '28000']);
const SQLSTATE_DOWN = new Set(['57P01', '57P02', '57P03', '08000', '08001', '08003', '08004', '08006', '08007', '3D000']);
const SQLSTATE_BUSY = new Set(['53300', '53400']);
const SQLSTATE_TIMEOUT = new Set(['57014', '55P03']);
const NET_DOWN = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'ETIMEDOUT']);

const COPY = {
  db_auth: 'Проблема на стороне сервиса. [[Подождите]] (db_auth)',
  db_down: 'Проблема на стороне сервиса. [[Подождите]] (db_down)',
  db_busy: 'Проблема на стороне сервиса. [[Подождите]] (db_busy)',
  timeout: 'Проблема на стороне сервиса. [[Подождите]] (timeout)',
  storage: 'Проблема на стороне сервиса. [[Подождите]] (storage)',
  internal: 'Проблема на стороне сервиса. [[Подождите]] (internal)',
};

function isPg(err) {
  return Boolean(err.severity || err.routine || (typeof err.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code)));
}

function isStorage(err) {
  return Boolean(err.$metadata || err.$fault);
}

function classified(status, reason) {
  return { status, error: COPY[reason], reason };
}

/** Safe text for the browser. Unexpected failures stay classified; raw messages are not forwarded. */
export function publicFailure(err) {
  const status = Number(err.status || err.statusCode) || 500;
  if (err.status && err.message) {
    return { status, error: err.message, reason: err.reason };
  }

  const code = typeof err.code === 'string' ? err.code : '';
  if (isStorage(err)) {
    const httpStatus = err.$metadata?.httpStatusCode;
    if (err.name === 'TimeoutError' || code === 'ETIMEDOUT' || httpStatus === 504) return classified(504, 'timeout');
    return classified(502, 'storage');
  }
  if (isPg(err) || NET_DOWN.has(code)) {
    if (SQLSTATE_AUTH.has(code)) return classified(503, 'db_auth');
    if (SQLSTATE_BUSY.has(code)) return classified(503, 'db_busy');
    if (SQLSTATE_TIMEOUT.has(code) || code === 'ETIMEDOUT') return classified(504, 'timeout');
    if (SQLSTATE_DOWN.has(code) || NET_DOWN.has(code)) return classified(503, 'db_down');
  }
  return classified(status >= 500 ? status : 500, 'internal');
}

export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
