#!/usr/bin/env node
'use strict';

/**
 * Interactive admin-user creation. Run once during setup:
 *   node scripts/create-admin.js
 *
 * Never bakes a username/password into source or .env — the hash is the only
 * thing that ends up in the database.
 */

const readline = require('readline');
const { hashPassword } = require('../src/auth/password');
const usersRepo = require('../src/modules/users/repository');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!hidden) {
      rl.question(question, (answer) => { rl.close(); resolve(answer); });
      return;
    }
    // Minimal masked input for the password prompt.
    const stdin = process.stdin;
    process.stdout.write(question);
    let input = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = (char) => {
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(input);
      } else if (char === '\u0003') {
        process.exit(1);
      } else if (char === '\u007f') {
        input = input.slice(0, -1);
      } else {
        input += char;
      }
    };
    stdin.on('data', onData);
  });
}

const VALID_ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'EDITOR', 'MODERATOR',
  'SEO_MANAGER', 'ANALYST', 'CRAWLER_MANAGER', 'AD_MANAGER', 'VIEWER'
];

(async () => {
  console.log('=== NavBharat Naukri — create admin user ===');
  const username = (await ask('Username: ')).trim();
  if (!username) { console.error('Username required.'); process.exit(1); }
  if (usersRepo.findByUsername(username)) { console.error('That username already exists.'); process.exit(1); }

  const password = await ask('Password (min 12 chars recommended): ', { hidden: true });
  if (password.length < 8) { console.error('Password too short (minimum 8 characters).'); process.exit(1); }

  const roleInput = (await ask(`Role [${VALID_ROLES.join(', ')}] (default SUPER_ADMIN): `)).trim().toUpperCase();
  const role = roleInput || 'SUPER_ADMIN';
  if (!VALID_ROLES.includes(role)) { console.error('Unknown role.'); process.exit(1); }

  const passwordHash = await hashPassword(password);
  const user = usersRepo.createUser({ username, passwordHash, roleName: role });
  console.log(`\nCreated user "${user.username}" with role ${role}. You can now log in at your secret admin URL.`);
  process.exit(0);
})();
