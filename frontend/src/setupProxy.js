/**
 * CRA dev server: chuyển mọi request `/api/*` sang backend (mặc định port 5000).
 * Khi có file này, mục "proxy" trong package.json thường bị bỏ qua — cấu hình tập trung ở đây.
 *
 * Đổi port backend: REACT_APP_PROXY_TARGET=http://127.0.0.1:5000
 */
const { createProxyMiddleware } = require("http-proxy-middleware");

module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_PROXY_TARGET || "http://127.0.0.1:5000";
  app.use(
    "/api",
    createProxyMiddleware({
      target,
      changeOrigin: true,
      logLevel: "warn",
    })
  );
};
