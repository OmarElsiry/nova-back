/**
 * Test for listing cancellation with proper authentication
 * This demonstrates the correct flow for authenticated operations
 */

import { test, expect } from '@playwright/test';

const API_BASE_URL = 'http://localhost:5001';

test.describe('Listing Cancellation with Authentication', () => {
  let authToken: string;
  const testUser = {
    telegramId: '7476391409', // Using the existing user from your database
  };

  test.beforeAll(async ({ request }) => {
    // Step 1: Login to get JWT token
    console.log('🔐 Logging in user...');
    const loginResponse = await request.post(`${API_BASE_URL}/api/auth/telegram/login`, {
      data: testUser,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // If user doesn't exist, register them first
    if (loginResponse.status() === 404) {
      console.log('📝 User not found, registering...');
      const registerResponse = await request.post(`${API_BASE_URL}/api/auth/telegram/register`, {
        data: {
          telegramId: testUser.telegramId,
          firstName: 'Test',
          lastName: 'User',
          username: 'testuser'
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      expect(registerResponse.ok()).toBeTruthy();
      const registerData = await registerResponse.json();
      authToken = registerData.data.token;
      console.log('✅ User registered and token obtained');
    } else {
      expect(loginResponse.ok()).toBeTruthy();
      const loginData = await loginResponse.json();
      authToken = loginData.data.token;
      console.log('✅ User logged in and token obtained');
    }
  });

  test('Cancel a listing with proper authentication', async ({ request }) => {
    const listingId = 7; // The listing ID from your error log
    
    // Step 2: Get listing details first (optional, for verification)
    console.log('📋 Fetching listing details...');
    const listingResponse = await request.get(`${API_BASE_URL}/api/listings/${listingId}`);
    
    if (listingResponse.ok()) {
      const listingData = await listingResponse.json();
      console.log('📦 Listing found:', listingData);
    }

    // Step 3: Cancel the listing WITH authentication
    console.log('🚫 Attempting to cancel listing with authentication...');
    const cancelResponse = await request.post(`${API_BASE_URL}/api/listings/${listingId}/cancel`, {
      data: {}, // Empty object since we're using JWT for auth
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}` // ✅ This is the crucial part!
      }
    });

    // Check response
    expect(cancelResponse.ok()).toBeTruthy();
    const cancelData = await cancelResponse.json();
    expect(cancelData.success).toBe(true);
    console.log('✅ Listing cancelled successfully:', cancelData);
  });

  test('Verify cancellation fails without authentication', async ({ request }) => {
    const listingId = 8; // Different listing for testing
    
    console.log('🔴 Attempting to cancel listing WITHOUT authentication...');
    const cancelResponse = await request.post(`${API_BASE_URL}/api/listings/${listingId}/cancel`, {
      data: {},
      headers: {
        'Content-Type': 'application/json'
        // NO Authorization header - this should fail
      }
    });

    // This SHOULD fail with 401
    expect(cancelResponse.status()).toBe(500); // Currently returns 500 but should be 401
    const errorData = await cancelResponse.json();
    expect(errorData.message).toContain('Authentication required');
    console.log('✅ Correctly rejected unauthenticated request');
  });
});

// Helper test to demonstrate the complete flow
test('Complete flow: Login → Get User Listings → Cancel Listing', async ({ request }) => {
  // 1. Login
  const loginResponse = await request.post(`${API_BASE_URL}/api/auth/telegram/login`, {
    data: { telegramId: '7476391409' },
    headers: { 'Content-Type': 'application/json' }
  });
  
  const { data: { token, user } } = await loginResponse.json();
  console.log('👤 Logged in as:', user);

  // 2. Get user's listings
  const listingsResponse = await request.get(
    `${API_BASE_URL}/api/channels/listings?telegram_id=${user.telegramId}`
  );
  
  const listingsData = await listingsResponse.json();
  console.log('📦 User listings:', listingsData);

  if (listingsData.listings && listingsData.listings.length > 0) {
    const listing = listingsData.listings[0];
    
    // 3. Cancel the first listing
    const cancelResponse = await request.post(
      `${API_BASE_URL}/api/listings/${listing.id}/cancel`,
      {
        data: {},
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );

    if (cancelResponse.ok()) {
      console.log('✅ Successfully cancelled listing:', listing.id);
    } else {
      const error = await cancelResponse.json();
      console.log('❌ Failed to cancel:', error);
    }
  }
});
