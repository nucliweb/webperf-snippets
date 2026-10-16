#!/usr/bin/env node
/**
 * Install WebPerf Skills globally to ~/.claude/skills
 *
 * This allows the skills to be used across any Claude Code session,
 * not just within this project.
 *
 * Run: npm run install-global
 * Or: node scripts/install-global.js
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { execSync } = require('child_process')

const ROOT = path.join(__dirname, '..')
const SKILLS_SRC = path.join(ROOT, 'skills')
const HOME_CLAUDE_SKILLS = path.join(os.homedir(), '.claude', 'skills')

function main() {
  console.log('🌍 Installing WebPerf Skills globally...\n')

  // Step 1: Generate skills
  console.log('1️⃣  Generating skills...')
  try {
    execSync('node scripts/generate-skills.js', { cwd: ROOT, stdio: 'inherit' })
  } catch {
    console.error('❌ Failed to generate skills')
    process.exit(1)
  }

  // Step 2: Create ~/.claude/skills directory
  console.log('\n2️⃣  Creating ~/.claude/skills directory...')
  fs.mkdirSync(HOME_CLAUDE_SKILLS, { recursive: true })

  // Step 3: Copy skills to ~/.claude/skills
  console.log('3️⃣  Copying skills to ~/.claude/skills/...')
  const skillDirs = fs.readdirSync(SKILLS_SRC).filter((f) => {
    const stat = fs.statSync(path.join(SKILLS_SRC, f))
    return stat.isDirectory()
  })

  for (const skillDir of skillDirs) {
    const src = path.join(SKILLS_SRC, skillDir)
    const dest = path.join(HOME_CLAUDE_SKILLS, skillDir)

    // Remove existing skill directory
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true })
    }

    // Copy skill directory recursively
    copyDir(src, dest)
    console.log(`   ✓ ${skillDir}`)
  }

  console.log('\n✅ Skills installed globally to ~/.claude/skills!')
  console.log('\nClaude Code discovers skills in ~/.claude/skills/ automatically, in every project.')
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
