import pg from '../apps/api/node_modules/pg/lib/index.js';

const connect = pg.Client.prototype.connect;
pg.Client.prototype.connect = function (...args) {
  if (this.ssl) {
    this.ssl = false;
    this.connection.ssl = false;
  }
  return connect.apply(this, args);
};
