import { request } from './client'

const BASE = '/cgi-bin/api/collector'

function mapListItem(item) {
  return { ...item, id: item.name, installed: item.installed, status: item.running ? 'running' : 'stopped' }
}

export const listCollectors = async () => {
  const data = await request('GET', `${BASE}/list`)
  return data.map(mapListItem)
}

export const getCollector = async (name) => {
  const data = await request('GET', `${BASE}?name=${encodeURIComponent(name)}`)
  return { name: data.name, config: data.config }
}

export const createCollector = (name, config) =>
  request('POST', BASE, { name, config })

export const updateCollector = (name, config) =>
  request('PUT', `${BASE}?name=${encodeURIComponent(name)}`, config)

export const deleteCollector = (name) =>
  request('DELETE', `${BASE}?name=${encodeURIComponent(name)}`)

export const startCollector = (name) =>
  request('POST', `${BASE}/start?name=${encodeURIComponent(name)}`)

export const stopCollector = (name) =>
  request('POST', `${BASE}/stop?name=${encodeURIComponent(name)}`)

export const installCollector = (name) =>
  request('POST', `${BASE}/install?name=${encodeURIComponent(name)}`)

export const testDbConnection = (db) =>
  request('POST', '/cgi-bin/api/db/connect', db)

export const createDbTable = (db) =>
  request('POST', '/cgi-bin/api/db/table/create', db)

export const getLastCollectedTime = async (name) => {
  const data = await request('GET', `${BASE}/last-time?name=${encodeURIComponent(name)}`)
  return data.lastCollectedAt
}

export const browseNodeChildren = (endpoint, nodeId, nodeClassMask = 0) =>
  request('POST', '/cgi-bin/api/opcua/node/descendants', { endpoint, node: nodeId, nodeClassMask })

export const testOpcuaConnection = (endpoint, readRetryInterval) =>
  request('POST', '/cgi-bin/api/opcua/connect', { endpoint, readRetryInterval })
