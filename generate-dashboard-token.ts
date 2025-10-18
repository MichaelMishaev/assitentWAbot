import { pool } from './src/config/database.js';
import { dashboardTokenService } from './src/services/DashboardTokenService.js';

async function generateDashboardForPhone(phone: string) {
  try {
    console.log(`\n🔍 Looking for user with phone: ${phone}\n`);

    // Find user by phone
    const userResult = await pool.query(
      'SELECT id, phone, name FROM users WHERE phone = $1',
      [phone]
    );

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found with phone: ${phone}`);
      console.log('\n💡 Available users:');
      const allUsers = await pool.query('SELECT id, phone, name FROM users LIMIT 10');
      allUsers.rows.forEach(u => console.log(`   - ${u.phone} (${u.name || 'No name'})`));
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`✅ User found:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Phone: ${user.phone}`);
    console.log(`   Name: ${user.name || 'No name'}\n`);

    // Generate dashboard token
    const token = await dashboardTokenService.generateToken(user.id);
    const ttl = await dashboardTokenService.getTokenTTL(token);

    console.log(`✅ Dashboard token generated:\n`);
    console.log(`📋 Token: ${token}`);
    console.log(`⏰ Expires in: ${Math.floor(ttl / 60)} minutes\n`);
    console.log(`🔗 Dashboard URL:`);
    console.log(`   http://localhost:8080/d/${token}\n`);
    console.log(`📊 To see the past events button:`);
    console.log(`   1. Open the URL above`);
    console.log(`   2. Scroll down past the stats cards`);
    console.log(`   3. Look for the "אירועי העבר" (Past Events) button\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Get phone from command line
const phone = process.argv[2] || '0544345287';
generateDashboardForPhone(phone);
