'use strict';

const { randomBytes, scryptSync } = require('node:crypto');

const SUPER_ADMIN_KEYS = ['INITIAL_SUPER_ADMIN_NAME', 'INITIAL_SUPER_ADMIN_EMAIL', 'INITIAL_SUPER_ADMIN_PASSWORD'];

function requireInitialSuperAdminEnvironment() {
  const missing = SUPER_ADMIN_KEYS.filter((key) => !process.env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing initial Super Admin environment variables: ${missing.join(', ')}`);
  }

  return {
    name: process.env.INITIAL_SUPER_ADMIN_NAME.trim(),
    email: process.env.INITIAL_SUPER_ADMIN_EMAIL.trim().toLowerCase(),
    password: process.env.INITIAL_SUPER_ADMIN_PASSWORD
  };
}

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const derived = scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

module.exports = {
  async up(queryInterface) {
    const admin = requireInitialSuperAdminEnvironment();
    const existing = await queryInterface.rawSelect('admin_users', { where: { email: admin.email } }, ['id']);
    if (existing) return;

    await queryInterface.bulkInsert('admin_users', [{
      name: admin.name,
      email: admin.email,
      password_hash: hashPassword(admin.password),
      role: 'super_admin',
      status: 'active',
      failed_login_attempts: 0,
      password_changed_at: new Date(),
      created_at: new Date(),
      updated_at: new Date()
    }]);
  },

  async down(queryInterface) {
    const email = process.env.INITIAL_SUPER_ADMIN_EMAIL?.trim().toLowerCase();
    if (!email) return;
    await queryInterface.bulkDelete('admin_users', { email, role: 'super_admin' });
  }
};
