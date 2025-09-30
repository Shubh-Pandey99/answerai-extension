# AI Meeting Assistant Extension

This repository contains the source code for the AI Meeting Assistant browser extension and its backend service, powered by Google AI Studio.

## Backend Deployment to Vercel

Follow these steps to deploy the backend service to Vercel.

### Prerequisites

- A GitHub account with this repository forked or cloned.
- A Vercel account.
- A Google AI Studio API key.

### 1. Get Your Google AI Studio API Key

1.  Go to **[Google AI Studio](https://aistudio.google.com/)**.
2.  Sign in with your Google account.
3.  Click on **"Get API key"** from the menu.
4.  Click **"Create API key in new project"**.
5.  Copy the generated API key. You will need this for the Vercel deployment.

### 2. Deploy to Vercel

1.  **Push to GitHub**: Make sure all the latest changes are pushed to your GitHub repository.

2.  **Create a New Vercel Project**:
    - Log in to your Vercel account and go to your dashboard.
    - Click "Add New..." and select "Project".

3.  **Import Your Repository**:
    - Import your `answerai-extension` repository from GitHub.

4.  **Configure the Project**:
    - **Root Directory**: Vercel should automatically select `answerai-extension`. If not, choose it from the list.
    - **Environment Variables**:
        - Add a new environment variable named `GOOGLE_API_KEY`.
        - Paste the API key you got from Google AI Studio into the value field.

5.  **Deploy**:
    - Click the "Deploy" button. Vercel will build and deploy your backend.

### 3. Verify Deployment

Once the deployment is complete, Vercel will provide you with a production URL. Open this URL in your browser, and you should see:
`AI Meeting Assistant backend is running successfully!`

### 4. Update the Extension

1.  **Update `popup.js` and `manifest.json`**:
    - In both files, find the old Vercel URL and replace it with your new one.

2.  **Reload the Extension**:
    - Go to `chrome://extensions`, find your extension, and click the reload button.

## Troubleshooting

-   **Summarization fails**: If the extension isn't working, check the "Runtime Logs" in your Vercel dashboard. The most common issue is an incorrect or invalid `GOOGLE_API_KEY`.
-   **Microphone/Capture Errors**: Refer to the previous troubleshooting sections for guidance on browser permissions.
