const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const dbPath = path.join(__dirname, 'database.db');
let dbInstance = null;

/**
 * Initializes the SQLite database connection and sets up the 'books' table.
 * Uses 'sqlite' and 'sqlite3' drivers.
 */
const initializeDB = async () => {
  if (dbInstance) {
    return dbInstance;
  }

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database,
  });

  // Enable foreign keys and set up the schema
  await dbInstance.exec('PRAGMA foreign_keys = ON;');
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS books (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      author TEXT NOT NULL,
      price REAL NOT NULL
    );
  `);

  return dbInstance;
};

/**
 * Returns the active database instance.
 */
const getDB = () => {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDB() first.');
  }
  return dbInstance;
};

module.exports = {
  initializeDB,
  getDB,
};

