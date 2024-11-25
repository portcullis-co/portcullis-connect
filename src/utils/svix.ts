import axios from 'axios';

// Svix API endpoint and key (ensure these are set in your environment variables)
const SVIX_API_URL = 'https://api.us.svix.com/api/v1/app/';
const SVIX_API_KEY = process.env.SVIX_API_KEY;  // Ensure this is set in your .env

// Create a Svix App and return the App ID
export async function createSvixApp(organization: string): Promise<string> {
  try {
    const response = await axios.post(
      SVIX_API_URL,
      {
        name: organization,
        description: `App for ${organization}`,
      },
      {
        headers: {
          'Authorization': `Bearer ${SVIX_API_KEY}`,
          'Content-Type': 'application/json',
        }
      }
    );
    
    // Return the App ID from the response
    return response.data.id;
  } catch (error) {
    console.error('Error creating Svix app:', error);
    throw new Error('Failed to create Svix app');
  }
}