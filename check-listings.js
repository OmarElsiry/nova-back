const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkListings() {
  try {
    // Check listing 1
    const listing1 = await prisma.channel.findUnique({
      where: { id: 1 }
    });
    
    console.log('Listing 1:', listing1);
    
    // Check listings for test user (userId is stored as telegramId in Users table)
    const testUser = await prisma.user.findUnique({
      where: { telegramId: '7476391409' }
    });
    
    console.log('\nTest user:', testUser);
    
    if (testUser) {
      const testUserListings = await prisma.channel.findMany({
        where: { userId: testUser.id }
      });
      
      console.log('\nListings for test user 7476391409:', testUserListings);
      
      // Create a test listing if none exists
      if (testUserListings.length === 0) {
        const newListing = await prisma.channel.create({
          data: {
            userId: testUser.id,
            username: 'test_channel_dev',
            name: 'Test Channel for Development',
            description: 'Test channel for development testing',
            category: 'Test',
            askingPrice: 100,
            status: 'active',
            hasEscrow: false,
            hasVerification: true,
            memberCount: 1000,
            dateAdded: new Date()
          }
        });
        console.log('\n✅ Created test listing:', newListing);
        console.log('\n📝 You can now test canceling listing ID:', newListing.id);
      } else {
        console.log('\n📝 Test user already has listings. You can cancel listing ID:', testUserListings[0].id);
      }
    } else {
      console.log('\n❌ Test user not found. Please register the user first.');
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkListings();
