'use strict';

/**
 * mysql socket class
 * @return {} []
 */
export default class extends think.adapter.socket {
  /**
   * init
   * @param  {Object} config [connection options]
   * @return {}        []
   */
  init(config = {}){
    //alias password config
    if (config.pwd) {
      config.password = config.pwd;
      delete config.pwd;
    }
    if (config.name) {
      config.database = config.name;
      delete config.name;
    }
    //merge config
    this.config = think.extend({
      host: '127.0.0.1',
      user: 'root',
      password: ''
    }, config);
    this.config.port = this.config.port || 3306;

    this.pool = null;
    this.connection = null;
  }
  /**
   * get connection
   * @return {Promise} [conneciton handle]
   */
  async getConnection(){
    if (this.connection) {
      return this.connection;
    }

    let config = this.config;
    let str = `mysql://${config.user}:${config.password}@${config.host}:${config.port}`;

    if (this.pool) {
      return think.await(str, () => {
        let fn = think.promisify(this.pool.getConnection, this.pool);
        let promise = fn().catch(err => {
          this.close();
          return Promise.reject(err);
        });
        let err = new Error(str);
        return think.error(promise, err);
      });
    }

    let mysql = await think.npm('mysql');

    if (config.connectionLimit) {
      this.logConnect(str, 'mysql');
      
      this.pool = mysql.createPool(config);
      return this.getConnection();
    }

    return think.await(str, () => {
      let deferred = think.defer();
      this.connection = mysql.createConnection(config);
      this.connection.connect(err => {
        
        this.logConnect(str, 'mysql');

        if (err) {
          deferred.reject(err);
          this.close();
        } else {
          deferred.resolve(this.connection);
        }
      });
      this.connection.on('error', () => {
        this.close();
      });
      //PROTOCOL_CONNECTION_LOST
      this.connection.on('end', () => {
        this.connection = null;
      });
      let err = new Error(str);
      return think.error(deferred.promise, err);
    });
  }
  /**
   * query sql
   * @param  {String} sql []
   * @return {[type]}     []
   */
  async query(sql, nestTables){
    let connection = await this.getConnection();
    let data = {
      sql: sql,
      nestTables: nestTables
    };
    //query timeout
    if (this.config.timeout) {
      data.timeout = this.config.timeout;
    }
    let startTime = Date.now();
    let fn = think.promisify(connection.query, connection);
    let promise = fn(data).then((rows = []) => {
      if (this.config.log_sql) {
        think.log(sql, 'SQL', startTime);
      }
      //auto close connection in cli mode
      if (think.cli) {
        this.close();
      }
      return rows;
    });
    return think.error(promise);
  }
  /**
   * execute
   * @param  {Array} args []
   * @return {Promise}         []
   */
  execute(...args){
    return this.query(...args);
  }
  /**
   * close connections
   * @return {} []
   */
  close(){
    if (this.pool) {
      this.pool.end(() => this.pool = null);
    } else if (this.connection) {
      this.connection.end(() => this.connection = null);
    }
  }
}