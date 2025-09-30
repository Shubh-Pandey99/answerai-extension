# AI Meeting Assistant Extension

This repository contains the source code for the AI Meeting Assistant browser extension and its flexible backend service.

## Flexible Backend with AI Provider Switching

The backend is designed to be flexible, allowing you to choose your preferred AI provider without changing any code. You can switch between **OpenAI**, **Google AI Studio**, or a **mock server** for testing.

### How It Works

The backend reads an `AI_PROVIDER` environment variable that you set in your Vercel deployment. Based on the value of this variable (`openai`, `google`, or `mock`), it will automatically use the correct client and API key.

## Deployment and Configuration

Follow these steps to deploy the backend and configure your chosen AI provider.

### 1. Push to GitHub

**This is the most important step.** After any code changes (like the ones we just made), you **must** push the new code to your GitHub repository. Vercel will only deploy the code that is on GitHub.

### 2. Deploy to Vercel

1.  Create a new project on Vercel and link it to your GitHub repository.
2.  When prompted for a **Root Directory**, select `answerai-extension`.

### 3. Configure Environment Variables in Vercel

This is the most important step. Go to your Vercel project's **Settings > Environment Variables** and add the following:

**1. Choose Your Provider:**
-   `AI_PROVIDER`: Set this to `openai`, `google`, or `mock`.

**2. Add the Corresponding API Key (if not using mock):**
-   If `AI_PROVIDER` is `openai`, you must also add:
    -   `OPENAI_API_KEY`: Your OpenAI API key.
-   If `AI_PROVIDER` is `google`, you must also add:
    -   `GOOGLE_API_KEY`: Your Google AI Studio API key. (Ensure your Google Cloud project has billing enabled).

**Example Configurations:**

-   **To use OpenAI:**
    -   `AI_PROVIDER`: `openai`
    -   `OPENAI_API_KEY`: `sk-...`
-   **To use Google AI:**
    -   `AI_PROVIDER`: `google`
    -   `GOOGLE_API_KEY`: `AIza...`
-   **To use the Mock Server:**
    -   `AI_PROVIDER`: `mock` (no API key needed)

### 4. Redeploy and Verify

After setting your environment variables, Vercel will automatically trigger a new deployment. Once it's complete, open your Vercel URL. You will see a message confirming which provider is active, for example:
`AI Meeting Assistant backend is running with the "openai" provider.`

### 5. Update the Extension

Finally, update the `popup.js` and `manifest.json` files with your new Vercel URL and reload the extension in Chrome. It will now be connected to your flexibly configured backend.
