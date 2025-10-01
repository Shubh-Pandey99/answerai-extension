# Deploying to Vercel

This guide explains how to deploy the AI Meeting Assistant backend to Vercel.

## Prerequisites

1.  **Vercel Account**: You need a Vercel account. You can sign up for free at [vercel.com](https://vercel.com).
2.  **Vercel CLI**: Install the Vercel command-line interface (CLI) globally using npm:
    ```bash
    npm install -g vercel
    ```
3.  **Git Repository**: Your project should be a Git repository, and it should be pushed to a provider like GitHub, GitLab, or Bitbucket.

## Project Configuration

The project is already configured for Vercel deployment via the `vercel.json` file. This file tells Vercel how to build and route the application.

-   `"src": "api/index.py"`: Specifies the main serverless function.
-   `"use": "@vercel/python"`: Uses the Vercel builder for Python. Vercel will automatically find your `requirements.txt` file and install the dependencies.

## Deployment Steps

1.  **Log in to Vercel**:
    Open your terminal and log in to your Vercel account:
    ```bash
    vercel login
    ```

2.  **Link Your Project**:
    Navigate to your project's root directory in the terminal and link it to a new or existing Vercel project:
    ```bash
    vercel link
    ```
    Follow the prompts to set up the project.

3.  **Set Environment Variables**:
    The application requires the `EMERGENT_LLM_KEY` environment variable. You can set this in your Vercel project's settings under "Environment Variables".

    Alternatively, you can set it using the Vercel CLI:
    ```bash
    vercel env add EMERGENT_LLM_KEY
    ```
    You will be prompted to enter the value for the key.

4.  **Deploy**:
    Deploy the project to production with the following command:
    ```bash
    vercel --prod
    ```
    Vercel will build and deploy your application. Once complete, it will provide you with the public URL.

## Post-Deployment

After deployment, your API will be live at the URL provided by Vercel. You will need to update the frontend (the browser extension) to point to this new production URL for it to communicate with the backend.
