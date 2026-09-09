'use strict';

const DATABASE_LIST_SQL = `
  SELECT NAME, KIND, ACCESS_MODE, CAN_USE, STATE, IS_DEFAULT
  FROM V$DATABASES
  WHERE KIND = 'ACTIVE'
    AND CAN_USE = 1
  ORDER BY IS_DEFAULT DESC, NAME
`.trim();

const DATABASE_STATUS_SQL = `
  SELECT NAME, KIND, ACCESS_MODE, CAN_USE, STATE, IS_DEFAULT
  FROM V$DATABASES
  WHERE NAME = ?
`.trim();

function rowValue(row, name) {
  if (!row) return null;
  if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
  const upper = String(name).toUpperCase();
  if (Object.prototype.hasOwnProperty.call(row, upper)) return row[upper];
  const lower = String(name).toLowerCase();
  if (Object.prototype.hasOwnProperty.call(row, lower)) return row[lower];
  return null;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  const text = String(value == null ? '' : value).trim().toLowerCase();
  return text === '1' || text === 'true' || text === 'yes' || text === 'y';
}

function normalizeDatabaseRows(rows) {
  return (rows || []).map((row) => {
    const accessMode = String(rowValue(row, 'ACCESS_MODE') || '').trim().toUpperCase();
    return {
      name: String(rowValue(row, 'NAME') || '').trim().toUpperCase(),
      kind: String(rowValue(row, 'KIND') || '').trim().toUpperCase(),
      accessMode,
      canUse: asBoolean(rowValue(row, 'CAN_USE')),
      state: String(rowValue(row, 'STATE') || '').trim().toUpperCase(),
      isDefault: asBoolean(rowValue(row, 'IS_DEFAULT')),
      writable: accessMode === 'READ_WRITE',
    };
  }).filter((item) => !!item.name);
}

function assertWritableDatabase(database, requestedName) {
  const name = String(requestedName || 'MACHBASEDB').trim().toUpperCase() || 'MACHBASEDB';
  if (!database || database.name !== name) {
    throw new Error(`database '${name}' does not exist or is not accessible`);
  }
  if (database.kind !== 'ACTIVE' || !database.canUse) {
    throw new Error(`database '${name}' is not an active usable database`);
  }
  if (!database.writable) {
    throw new Error(`database '${name}' must be READ_WRITE`);
  }
  return database;
}

module.exports = {
  DATABASE_LIST_SQL,
  DATABASE_STATUS_SQL,
  normalizeDatabaseRows,
  assertWritableDatabase,
};
