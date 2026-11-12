// Le frontend lit `error.message` dans le corps JSON (voir apiClient.js)
class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

module.exports = { HttpError };
