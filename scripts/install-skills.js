#!/usr/bin/env node
/**
 * Install WebPerf Skills to the local .claude/skills directory
 *
 * This script:
 * 1. Generates skills using generate-skills.js
 * 2. Copies them to .claude/skills/ for local project use
 * 3. Updates .claude/settings.json with skill paths
 *
 * Run: npm run install-skills
 */

const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SKILLS_SRC = path.join(ROOT, 'skills')
const CLAUDE_SKILLS_DEST = path.join(ROOT, '.claude', 'skills')
const SETTINGS_FILE = path.join(ROOT, '.claude', 'settings.json')

function main() {
  console.log('📦 Installing WebPerf Skills locally...\n')

  // Step 1: Generate skills
  console.log('1️⃣  Generating skills...')
  try {
    execSync('node scripts/generate-skills.js', { cwd: ROOT, stdio: 'inherit' })
  } catch (error) {
    console.error('❌ Failed to generate skills')
    process.exit(1)
  }

  // Step 2: Create .claude/skills directory
  console.log('\n2️⃣  Creating .claude/skills directory...')
  fs.mkdirSync(CLAUDE_SKILLS_DEST, { recursive: true })

  // Step 3: Copy skills to .claude/skills
  console.log('3️⃣  Copying skills to .claude/skills/...')
  const skillDirs = fs.readdirSync(SKILLS_SRC).filter((f) => {
    const stat = fs.statSync(path.join(SKILLS_SRC, f))
    return stat.isDirectory()
  })

  for (const skillDir of skillDirs) {
    const src = path.join(SKILLS_SRC, skillDir)
    const dest = path.join(CLAUDE_SKILLS_DEST, skillDir)

    // Remove existing skill directory
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }

    // Copy skill directory recursively
    copyDir(src, dest)
    console.log(`   ✓ ${skillDir}`)
  }

  // Step 4: Update settings.json
  console.log('\n4️⃣  Updating .claude/settings.json...')
  const settings = {
    skills: skillDirs.map((name) => ({ path: `./skills/${name}` }))
  }
  fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2) + '\n')
  console.log(`   ✓ Registered ${skillDirs.length} skills`)

  console.log('\n✅ Skills installed successfully!')
  console.log('\nAvailable skills:')
  skillDirs.forEach((name) => console.log(`   - ${name}`))
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })

  for (const entry of fs.readdirSync(src)) {
    const srcPath = path.join(src, entry)
    const destPath = path.join(dest, entry)
    const stat = fs.statSync(srcPath)

    if (stat.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

main()
