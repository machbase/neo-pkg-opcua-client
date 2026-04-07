import { request } from './client'

const BASE = '/cgi-bin/api/collector'

function mapListItem(item) {
  return { ...item, id: item.name, status: item.running ? 'running' : 'stopped' }
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

export const browseNodeChildren = (endpoint, nodeId, nodeClassMask = 0) =>
  request('POST', '/cgi-bin/api/node/children', { endpoint, node: nodeId, nodeClassMask })
