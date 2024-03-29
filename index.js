const VAddy = require('./vaddy')
const core = require('@actions/core')

async function run() {
  let vaddy = new VAddy()
  vaddy.setSecret()
  if (vaddy.projectId) {
    await scanV2(vaddy)
  } else {
    await scanV1(vaddy)
  }
}

// scanV2 scans vaddy V2 project.
async function scanV2(vaddy) {
  try { 
    const rp = await vaddy.waitRunningProcessV2(10)
    if (rp > 0) {
      throw new Error('running_process: ' + rp)
    }
    const scanId = await vaddy.startScanV2()
    core.info('scan_id: ' + scanId)
    let result = await vaddy.waitScanV2(scanId)
    if (result.status === 'finish') {
      core.info('finish')
      core.info('scan_result_url: ' + result.scan_result_url)
      setOutput(result)
      if (result.alert_count > 0) {
        throw new Error('alert_count: ' + result.alert_count)
      }
    } else {
      core.setOutput('scan_finished', false)
      throw new Error('status: ' + result.status)
    }
  }
  catch (err) {
    core.setFailed(err.message);
  }
}

// scanV1 scans vaddy V1(Private Net) project.
async function scanV1(vaddy) {
  try { 
    const rp = await vaddy.waitRunningProcess(10)
    if (rp > 0) {
      throw new Error('running_process: ' + rp)
    }
    if (vaddy.privateKey) {
      core.info('use private_key from input')
      await vaddy.putKey()
    } else {
      core.info('generate private_key')
      await vaddy.genKey()
      await vaddy.postKey()
    }
    await vaddy.getPort()
    const sp = await vaddy.spawnSsh()
    sp.on('error', (err) => {
      sp.kill()
      throw new Error(err)
    })
    const scanId = await vaddy.startScan()
    core.info('scan_id: ' + scanId)
    let result = await vaddy.waitScan(scanId)
    if (result.status === 'finish') {
      core.info('finish')
      core.info('scan_result_url: ' + result.scan_result_url)
      setOutput(result)
      if (result.alert_count > 0) {
        sp.kill()
        throw new Error('alert_count: ' + result.alert_count)
      }
    } else {
      core.setOutput('scan_finished', false)
      sp.kill()
      throw new Error('status: ' + result.status)
    }
    sp.kill()
  }
  catch (err) {
    core.setFailed(err.message);
  }
}

function setOutput(result) {
  core.setOutput('scan_finished', true)
  core.setOutput('project_id', result.project_id)
  core.setOutput('scan_id', result.scan_id)
  core.setOutput('scan_count', result.scan_count)
  core.setOutput('alert_count', result.alert_count)
  core.setOutput('scan_result_url', result.scan_result_url)
  core.setOutput('complete', result.complete)
  core.setOutput('crawl_id', result.crawl_id)
  core.setOutput('crawl_label', result.crawl_label)
  core.setOutput('scan_list', result.scan_list)
}

run()
