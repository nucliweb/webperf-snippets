#!/usr/bin/env node
/**
 * Install WebPerf Skills from a GitHub Release.
 *
 * Downloads the skills package from a specific release tag (or latest)
 * and installs them to ~/.claude/skills without cloning the repository.
 *
 * Usage:
 *   node scripts/install-from-release.js          # latest release
 *   node scripts/install-from-release.js v1.2.0   # specific version
 *
 * Or via npx (no clone needed):
 *   npx github:nucliweb/webperf-snippets/scripts/install-from-release.js
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const https = require('https')
const { execSync } = require('child_process')

const REPO = 'nucliweb/webperf-snippets'
const ASSET_NAME = 'webperf-skills-all.zip'
const INSTALL_DIR = path.join(os.homedir(), '.claude', 'skills')
const VERSION_FILE = path.join(os.homedir(), '.claude', '.webperf-snippets-version')

const requestedVersion = process.argv[2] || 'latest'

async function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'webperf-snippets-installer',
        Accept: 'application/vnd.github.v3+json',
      },
    }
    https.get(url, options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return fetchJson(res.headers.location).then(resolve).catch(reject)
      }
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch {
          reject(new Error(`Failed to parse response from ${url}`))
        }
      })
      res.on('error', reject)
    })
  })
}

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: { 'User-Agent': 'webperf-snippets-installer' },
    }
    https.get(url, options, (res) => {
      if (res.statusCode === 302 || res.statusCode === 301) {
        return downloadFile(res.headers.location, dest).then(resolve).catch(reject)
      }
      const file = fs.createWriteStream(dest)
      res.pipe(file)
      file.on('finish', () => file.close(resolve))
      file.on('error', reject)
    })
  })
}

async function getReleaseInfo(version) {
  const url =
    version === 'latest'
      ? `https://api.github.com/repos/${REPO}/releases/latest`
      : `https://api.github.com/repos/${REPO}/releases/tags/${version}`
  return fetchJson(url)
}

async function main() {
  console.log(`\nWebPerf Skills installer`)
  console.log(`Repository: https://github.com/${REPO}\n`)

  console.log(`Fetching release info (${requestedVersion})...`)
  const release = await getReleaseInfo(requestedVersion)
  const version = release.tag_name

  const currentVersion = fs.existsSync(VERSION_FILE)
    ? fs.readFileSync(VERSION_FILE, 'utf8').trim()
    : null

  if (currentVersion === version) {
    console.log(`Skills are already at version ${version}. Nothing to do.`)
    return
  }

  const asset = release.assets.find((a) => a.name === ASSET_NAME)
  if (!asset) {
    throw new Error(`Asset "${ASSET_NAME}" not found in release ${version}`)
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'webperf-skills-'))
  const zipPath = path.join(tmpDir, ASSET_NAME)

  console.log(`Downloading ${version}...`)
  await downloadFile(asset.browser_download_url, zipPath)

  console.log(`Installing to ${INSTALL_DIR}...`)
  fs.mkdirSync(INSTALL_DIR, { recursive: true })

  execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { stdio: 'pipe' })

  const skillsExtracted = path.join(tmpDir, 'skills')
  for (const entry of fs.readdirSync(skillsExtracted)) {
    const src = path.join(skillsExtracted, entry)
    const dest = path.join(INSTALL_DIR, entry)
    if (fs.statSync(src).isDirectory()) {
      if (fs.existsSync(dest)) fs.rmSync(dest, { recursive: true, force: true })
      copyDir(src, dest)
    }
  }

  fs.rmSync(tmpDir, { recursive: true, force: true })

  fs.writeFileSync(VERSION_FILE, version, 'utf8')

  console.log(`\nSkills installed successfully (${version})`)
  console.log(`Location: ${INSTALL_DIR}`)

  if (currentVersion) {
    console.log(`Updated from ${currentVersion} to ${version}`)
  }

  const installedSkills = fs
    .readdirSync(INSTALL_DIR)
    .filter((f) => fs.statSync(path.join(INSTALL_DIR, f)).isDirectory())

  console.log('\nInstalled skills:')
  installedSkills.forEach((name) => console.log(`  - ${name}`))
  console.log(
    '\nAdd them to your .claude/settings.json under "skills" to use in Claude Code.'
  )
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    if (fs.statSync(srcPath).isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

main().catch((err) => {
  console.error(`\nError: ${err.message}`)
  process.exit(1)
})
