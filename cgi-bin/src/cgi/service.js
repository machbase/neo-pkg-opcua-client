'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const service = require('service');

const HOME = process.env.get('HOME');
const SERVICE_DIR = path.join(HOME, 'etc', 'services');
const APP_DIR = process.argv[1].slice(0, process.argv[1].lastIndexOf('/cgi-bin/') + '/cgi-bin'.length);

const _appName = path.basename(path.dirname(APP_DIR));
const _nameMatch = _appName.match(/^neo-pkg-(.+)$/);

/**
 * service 이름 앞에 붙는 prefix.
 * 패키지 디렉토리명 `neo-pkg-xxx` 에서 `xxx` 앞 3글자를 추출해 `_xxx_` 형태로 구성한다.
 * 예: `neo-pkg-opcua-client` → `_opc_`
 * @type {string}
 */
const SERVICE_PREFIX = _nameMatch ? `_${_nameMatch[1].slice(0, 3)}_` : '__';

/**
 * 지정한 collector의 service definition 파일이 존재하는지 확인한다.
 * @param {string} name - collector 이름
 * @returns {boolean}
 */
function installed(name) {
  try {
    return fs.statSync(path.join(SERVICE_DIR, `${SERVICE_PREFIX}${name}.json`)).isFile();
  } catch (_) {
    return false;
  }
}

/**
 * service definition 파일을 삭제한다. 파일이 없어도 오류를 던지지 않는다.
 * @param {string} name - collector 이름
 */
function remove(name) {
  try {
    fs.unlinkSync(path.join(SERVICE_DIR, `${SERVICE_PREFIX}${name}.json`));
  } catch (_) {}
}

/**
 * 지정한 collector의 service 상태를 조회한다.
 * @param {string} name - collector 이름
 * @param {function(Error|null, object=): void} callback
 */
function status(name, callback) {
  service.status(`${SERVICE_PREFIX}${name}`, callback);
}

/**
 * 이 패키지에 속한 service 목록을 조회한다.
 * SERVICE_PREFIX 로 시작하는 service만 필터링해서 반환한다.
 * @param {function(Error|null, object[]=): void} callback
 */
function listServices(callback) {
  service.status((err, serviceInfos) => {
    if (err) {
      callback(err);
      return;
    }
    if (Array.isArray(serviceInfos)) {
      callback(null, serviceInfos.filter(s => {
        const n = (s && s.config && s.config.name) || (s && s.name) || '';
        return n.startsWith(SERVICE_PREFIX);
      }));
    } else if (serviceInfos) {
      const n = (serviceInfos.config && serviceInfos.config.name) || serviceInfos.name || '';
      callback(null, n.startsWith(SERVICE_PREFIX) ? [serviceInfos] : []);
    } else {
      callback(null, []);
    }
  });
}

/**
 * collector를 service로 등록한다.
 * @param {string} name - collector 이름
 * @param {function(Error|null): void} callback
 */
function install(name, callback) {
  service.install({
    name: `${SERVICE_PREFIX}${name}`,
    enable: false,
    working_dir: APP_DIR,
    executable: path.join(APP_DIR, 'neo-collector.js'),
    args: [`${name}.json`],
  }, callback);
}

/**
 * 등록된 service를 제거한다.
 * @param {string} name - collector 이름
 * @param {function(Error|null): void} callback
 */
function uninstall(name, callback) {
  service.uninstall(`${SERVICE_PREFIX}${name}`, callback);
}

/**
 * service를 시작한다.
 * @param {string} name - collector 이름
 * @param {function(Error|null): void} callback
 */
function start(name, callback) {
  service.start(`${SERVICE_PREFIX}${name}`, callback);
}

/**
 * service를 중지한다.
 * @param {string} name - collector 이름
 * @param {function(Error|null): void} callback
 */
function stop(name, callback) {
  service.stop(`${SERVICE_PREFIX}${name}`, callback);
}

/**
 * service details에서 키에 해당하는 값을 가져온다.
 * @param {string} name - collector 이름
 * @param {string} key
 * @param {function(Error|null, *=): void} callback - 두 번째 인자로 값(또는 null)을 전달
 */
function getValue(name, key, callback) {
  try {
    service.details.get(`${SERVICE_PREFIX}${name}`, key, (err, result) => {
      if (err) { callback(err); return; }
      const value = result && result.details ? (result.details[key] ?? null) : null;
      callback(null, value);
    });
  } catch (err) {
    callback(err);
  }
}

/**
 * service details에 키-값 쌍을 저장한다.
 * @param {string} name - collector 이름
 * @param {string} key
 * @param {*} value
 * @param {function(Error|null): void} callback
 */
function setValue(name, key, value, callback) {
  try {
    service.details.set(`${SERVICE_PREFIX}${name}`, key, value, callback);
  } catch (err) {
    callback(err);
  }
}

/**
 * service details에서 키를 삭제한다.
 * @param {string} name - collector 이름
 * @param {string} key
 * @param {function(Error|null): void} callback
 */
function deleteValue(name, key, callback) {
  try {
    service.details.delete(`${SERVICE_PREFIX}${name}`, key, callback);
  } catch (err) {
    callback(err);
  }
}

module.exports = {
  SERVICE_PREFIX,
  installed,
  remove,
  status,
  listServices,
  install,
  uninstall,
  start,
  stop,
  getValue,
  setValue,
  deleteValue,
};
