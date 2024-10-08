const core = require('@actions/core')
const io = require('@actions/io')
const httpm = require('@actions/http-client')
const querystring = require('querystring');
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, execSync } = require('child_process');

const endpoint = 'https://api.vaddy.net'
const api_version_v1 = '/v1'
const api_version_v2 = '/v2'

function sleep(waitSec) {
    return new Promise(function (resolve) {
        setTimeout(function() { resolve() }, waitSec);
    });
} 

class VAddy {
  constructor() {
    this.user = core.getInput('user')
    this.authKey = core.getInput('auth_key')
    this.projectId = core.getInput('project_id')
    this.fqdn = core.getInput('fqdn')
    this.verificationCode = core.getInput('verification_code')
    this.privateKey = core.getInput('private_key')
    this.localIP = core.getInput('local_ip')
    this.localPort = core.getInput('local_port')
    this.crawlId = core.getInput('crawl_id')
    this.sshdir = path.join(os.homedir(), '/vaddy/ssh')
    this.keypath = path.join(this.sshdir, 'key')
    this.http = new httpm.HttpClient('vaddy-action')
  }

  setSecret() {
    core.setSecret('user')
    core.setSecret('auth_key')
    core.setSecret('project_id')
    core.setSecret('fqdn')
    core.setSecret('verification_code')
    core.setSecret('private_key')
    core.setSecret('remote_port')
    core.setSecret('local_ip')
    core.setSecret('local_port')
  }

  async putKey() {
    await io.mkdirP(this.sshdir)
    fs.writeFileSync(this.keypath, this.privateKey+os.EOL, {mode: 0o600, flag: 'ax'})
  }

  async genKey() {
    await io.mkdirP(this.sshdir)
    execSync('ssh-keygen -t rsa -q -f ' + this.keypath + ' -N ""')
  }

  async postKey() {
    const key = fs.readFileSync(this.keypath+'.pub')
    let url = new URL(api_version_v1 + '/privnet/sshkey', endpoint)
    let data = {
      'user': this.user,
      'auth_key': this.authKey,
      'fqdn': this.fqdn,
      'sshkey': key.toString(),
    }
    const postData = querystring.stringify(data)
    let res = await this.http.post(url.toString(), postData, {
      'Content-Type': 'application/x-www-form-urlencoded'
    })
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
  }

  async getPort() {
    let url = new URL(api_version_v1 + '/privnet/port', endpoint)
    url.searchParams.set('user', this.user)
    url.searchParams.set('auth_key', this.authKey)
    url.searchParams.set('fqdn', this.fqdn)
    let res = await this.http.get(url.toString())
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    this.remotePort = obj.port
    return obj.port
  }

  async spawnSsh() {
    return spawn('ssh', [
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'StrictHostKeyChecking=no',
      '-i',
      path.join(this.sshdir, 'key'),
      '-N',
      '-R',
      '0.0.0.0:'+this.remotePort+':'+this.localIP+':'+this.localPort,
      'portforward@pfd.vaddy.net',
    ])
  }

  async runCheck() {
    let url = new URL(api_version_v1 + '/scan/runcheck', endpoint)
    url.searchParams.set('user', this.user)
    url.searchParams.set('auth_key', this.authKey)
    url.searchParams.set('fqdn', this.fqdn)
    url.searchParams.set('verification_code', this.verificationCode)
    let res = await this.http.get(url.toString())
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj.running_process
  }

  async runCheckV2() {
    let url = new URL(api_version_v2 + '/scan/runcheck', endpoint)
    url.searchParams.set('user', this.user)
    url.searchParams.set('auth_key', this.authKey)
    url.searchParams.set('project_id', this.projectId)
    let res = await this.http.get(url.toString())
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj.running_process
  }

  async waitRunningProcess(timeout) {
    let rp = await this.runCheck()
    for (var i = 0; i < timeout; i++) {
      if (rp === 0) {
        return rp
      }
      core.info('wait for running process: ' + rp)
      await sleep(1)
      rp = await this.runCheck()
    }
    return rp
  }

  async waitRunningProcessV2(timeout) {
    let rp = await this.runCheckV2()
    for (var i = 0; i < timeout; i++) {
      if (rp === 0) {
        return rp
      }
      core.info('wait for running process: ' + rp)
      await sleep(1)
      rp = await this.runCheckV2()
    }
    return rp
  }

  async startScan() {
    let url = new URL(api_version_v1 + '/scan', endpoint)
    let data = {
      'action': 'start',
      'user': this.user,
      'auth_key': this.authKey,
      'fqdn': this.fqdn,
      'verification_code': this.verificationCode,
    }
    if (this.crawlId) {
      data['crawl_id'] = this.crawlId
    }
    const postData = querystring.stringify(data)
    let res = await this.http.post(url.toString(), postData, {
      'Content-Type': 'application/x-www-form-urlencoded'
    })
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj.scan_id
  }

  async startScanV2() {
    let url = new URL(api_version_v2 + '/scan', endpoint)
    let data = {
      'action': 'start',
      'user': this.user,
      'auth_key': this.authKey,
      'project_id': this.projectId,
    }
    if (this.crawlId) {
      data['crawl_id'] = this.crawlId
    }
    const postData = querystring.stringify(data)
    let res = await this.http.post(url.toString(), postData, {
      'Content-Type': 'application/x-www-form-urlencoded'
    })
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj.scan_id
  }

  async getScanResult(scanId) {
    let url = new URL(api_version_v1 + '/scan/result', endpoint)
    url.searchParams.set('user', this.user)
    url.searchParams.set('auth_key', this.authKey)
    url.searchParams.set('fqdn', this.fqdn)
    url.searchParams.set('verification_code', this.verificationCode)
    url.searchParams.set('scan_id', scanId)
    let res = await this.http.get(url.toString())
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj
  }

  async getScanResultV2(scanId) {
    let url = new URL(api_version_v2 + '/scan/result', endpoint)
    url.searchParams.set('user', this.user)
    url.searchParams.set('auth_key', this.authKey)
    url.searchParams.set('scan_id', scanId)
    let res = await this.http.get(url.toString())
    let body = await res.readBody()
    let obj = JSON.parse(body)
    if (res.message.statusCode !== 200) {
      throw new Error(obj.error_message)
    }
    return obj
  }

  async waitScan(scanId) {
    let result = await this.getScanResult(scanId)
    while (result.status === 'scanning') {
      await sleep(5)
      result = await this.getScanResult(scanId)
    }
    return result
  }

  async waitScanV2(scanId) {
    let result = await this.getScanResultV2(scanId)
    while (result.status === 'scanning') {
      await sleep(5)
      result = await this.getScanResultV2(scanId)
    }
    return result
  }
}

module.exports = VAddy
