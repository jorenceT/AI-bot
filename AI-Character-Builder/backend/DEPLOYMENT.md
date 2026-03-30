# Deploying to Render

This guide will help you deploy your AI Character Builder backend to Render.

## Prerequisites

1. A GitHub account
2. A Render account (free at [render.com](https://render.com))
3. Your Gemini API key

## Step 1: Push Your Code to GitHub

```bash
# Initialize git if not already done
git init

# Add all files
git add .

# Commit your changes
git commit -m "Prepare for Render deployment"

# Add your GitHub remote (replace with your repo URL)
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git

# Push to GitHub
git push -u origin main
```

## Step 2: Create a Render Account

1. Go to [render.com](https://render.com)
2. Sign up using your GitHub account
3. Verify your email address

## Step 3: Create a New Web Service

1. Click **"New +"** button in the top right
2. Select **"Web Service"**
3. Connect your GitHub repository:
   - Click **"Connect GitHub"** if not already connected
   - Select your repository from the list
   - Click **"Connect"**

## Step 4: Configure Your Service

Fill in the following settings:

| Setting | Value |
|---------|-------|
| **Name** | `ai-character-builder-backend` (or your preferred name) |
| **Region** | Choose closest to your users |
| **Branch** | `main` |
| **Root Directory** | `backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm install` |
| **Start Command** | `npm start` |

## Step 5: Add Environment Variables

Click **"Advanced"** and add these environment variables:

| Key | Value |
|-----|-------|
| `GEMINI_API_KEY` | Your Gemini API key |
| `PORT` | `10000` (Render's default) |
| `NODE_ENV` | `production` |

Optional variables (if needed):
- `PIPER_BASE_URL` - Your Piper TTS endpoint
- `APP_ID` - Your app authentication ID
- `APP_SECRET` - Your app authentication secret

## Step 6: Deploy

1. Click **"Create Web Service"**
2. Wait for the build to complete (usually 2-5 minutes)
3. Your service will be available at: `https://your-service-name.onrender.com`

## Step 7: Verify Deployment

Test your deployment by visiting:
```
https://your-service-name.onrender.com/health
```

You should see a JSON response like:
```json
{
  "ok": true,
  "service": "ai-character-builder-backend",
  "time": "2024-01-01T00:00:00.000Z",
  "features": {
    "gemini": true,
    "piper": false,
    "appAuth": false
  }
}
```

## Important Notes

### Free Tier Limitations
- Render's free tier spins down after 15 minutes of inactivity
- First request after spin-down may take 30-60 seconds
- Consider upgrading to a paid plan for production use

### Ollama/TinyLlama
- **Not available** in cloud deployments
- The `/api/tinyllama/chat` endpoint will return a 503 error
- Use Gemini endpoints instead for cloud deployment

### CORS Configuration
- Your backend already has CORS enabled (`*`)
- Update your frontend to use the new Render URL

## Updating Your Frontend

Update your Angular app's API endpoint to point to your Render deployment:

```typescript
// src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://your-service-name.onrender.com'
};
```

## Troubleshooting

### Build Fails
- Check that `backend/package.json` exists
- Verify Node.js version compatibility

### Service Won't Start
- Check logs in Render dashboard
- Verify environment variables are set correctly
- Ensure `PORT` is set to `10000`

### API Errors
- Verify `GEMINI_API_KEY` is set correctly
- Check that your API key has proper permissions
- Review Render logs for detailed error messages

## Automatic Deployments

Render automatically deploys when you push to your main branch:

```bash
# Make changes to your code
git add .
git commit -m "Update feature"
git push origin main

# Render will automatically deploy the changes
```

## Custom Domain (Optional)

1. Go to your service settings in Render
2. Click **"Custom Domains"**
3. Add your domain and follow DNS configuration instructions

## Support

- Render Documentation: https://docs.render.com
- Render Community: https://community.render.com