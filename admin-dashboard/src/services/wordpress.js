import { getSiteConnection } from './database.js';
import { createHash, randomBytes } from 'crypto';

// WordPress-compatible portable PHPass hash (MD5-based, itoa64 encoding)
const ITOA64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function encode64(input, count) {
  let output = '';
  let i = 0;
  while (i < count) {
    let value = input[i++];
    output += ITOA64[value & 0x3f];
    if (i < count) value |= input[i] << 8;
    output += ITOA64[(value >> 6) & 0x3f];
    if (i++ >= count) break;
    if (i < count) value |= input[i] << 8;
    output += ITOA64[(value >> 12) & 0x3f];
    if (i++ >= count) break;
    output += ITOA64[(value >> 18) & 0x3f];
  }
  return output;
}

function wpHashPassword(password) {
  const salt = randomBytes(6);
  const saltStr = encode64(salt, 6);
  // WordPress uses 8192 iterations (log2 = 13, char 'D' in itoa64)
  const countLog2 = 13;
  const count = 1 << countLog2;

  let hash = createHash('md5').update(saltStr + password).digest();
  for (let i = 0; i < count; i++) {
    hash = createHash('md5').update(Buffer.concat([hash, Buffer.from(password)])).digest();
  }

  return '$P$' + ITOA64[Math.min(countLog2 + 5, 30)] + saltStr + encode64(hash, 16);
}

export async function setPasswordDirect(dbName, userLogin, newPassword) {
  const hash = wpHashPassword(newPassword);
  const conn = await getSiteConnection(dbName);
  try {
    const [result] = await conn.query(
      'UPDATE wp_users SET user_pass = ? WHERE user_login = ?',
      [hash, userLogin]
    );
    if (result.affectedRows === 0) {
      throw new Error(`User "${userLogin}" not found in database "${dbName}"`);
    }
    return { success: true };
  } finally {
    await conn.end();
  }
}

export async function listWpUsers(dbName) {
  const conn = await getSiteConnection(dbName);
  try {
    const [rows] = await conn.query(
      'SELECT ID, user_login, user_email, display_name FROM wp_users ORDER BY ID'
    );
    return rows;
  } finally {
    await conn.end();
  }
}

export async function triggerEmailReset(siteUrl, userLogin) {
  const url = `${siteUrl}/wp-login.php?action=lostpassword`;
  const body = new URLSearchParams({
    user_login: userLogin,
    redirect_to: '',
    'wp-submit': 'Get New Password',
  });
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
    redirect: 'manual',
  });
  return { status: res.status, success: res.status === 302 || res.status === 200 };
}
