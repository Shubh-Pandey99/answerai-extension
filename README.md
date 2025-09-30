# AI Meeting Assistant Extension

This repository contains the source code for the AI Meeting Assistant browser extension and its backend service.

## Backend Deployment to Vercel

Follow these steps to deploy the backend service to Vercel.

### Prerequisites

- A GitHub account with this repository forked or cloned.
- A Vercel account.

### Deployment Steps

1.  **Push to GitHub**: Make sure all the latest changes, including the `api` directory and `vercel.json` file, are pushed to your GitHub repository.

2.  **Create a New Vercel Project**:
    - Log in to your Vercel account.
    - Click the "Add New..." button and select "Project".

3.  **Import Your Repository**:
    - In the "Import Git Repository" section, find and select your GitHub repository for this project.

4.  **Configure the Project**:
    - Vercel will automatically detect that you are using Node.js.
    - The build and output settings should be configured automatically based on the `vercel.json` file. No changes are needed here.

5.  **Add Environment Variable**:
    - Before deploying, you need to add your OpenAI API key as an environment variable.
    - In the project settings, go to the "Environment Variables" section.
    - Add a new variable with the name `OPENAI_API_KEY` and paste your secret key in the value field.
    - Make sure to save it.

6.  **Deploy**:
    - Click the "Deploy" button.
    - Vercel will now build and deploy your backend service. This may take a few minutes.

### Verify Deployment

Once the deployment is complete, Vercel will provide you with a production URL (e.g., `https://your-project-name.vercel.app`).

To verify that the deployment was successful, open this URL in your browser. You should see the message:
`AI Meeting Assistant backend is running successfully!`

### Update the Extension

After a successful deployment, you need to update the extension to use your new backend URL.

1.  **Update `popup.js`**:
    - Open the `popup.js` file.
    - Find all instances of the old URL (`https://3000-firebase-answerai-extension-1759171945157.cluster-73qgvk7hjjadkrjeyexca5ivva.cloudworkstations.dev`) and replace them with your new Vercel URL.

2.  **Update `manifest.json`**:
    - Open the `manifest.json` file.
    - In the `host_permissions` section, replace the old URL with your new Vercel URL.

After updating these files, reload the extension in your browser to apply the changes. The extension should now be communicating with your live backend on Vercel.
