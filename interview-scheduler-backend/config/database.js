const sql = require('mssql');
require('dotenv').config();

const sqlConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  server: process.env.DB_SERVER,   // only the IP or hostname
  port: parseInt(process.env.DB_PORT, 10),
  options: {
    encrypt: false,
    trustServerCertificate: true,
  },
};


let poolPromise;

const getPool = () => {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .then(pool => {
        console.log('Connected to SQL Server');
        return pool;
      })
      .catch(err => {
        console.error('Database connection failed:', err);
        throw err;
      });
  }
  return poolPromise;
};

module.exports = { getPool, sql };
