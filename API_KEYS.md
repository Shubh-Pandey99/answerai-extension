# API Key Management

This document explains the purpose of the API keys used in the AI Meeting Assistant application.

## `OPENAI_API_KEY`

### What is it?

The `OPENAI_API_KEY` is the primary API key used by this application to access advanced AI models like GPT-4o.

### Why is it needed?

The backend of this application uses OpenAI as its main AI provider. This service allows the application to:

-   Process meeting transcripts to provide summaries and answer questions.
-   Analyze images.
-   Support streaming responses for real-time interaction.

The `OPENAI_API_KEY` authenticates the application with OpenAI, allowing it to make API calls to the AI models. Without this key, the application's core features will not work.

### How is it used?

In the backend code (`api/index.py`), the `OPENAI_API_KEY` is retrieved from the environment variables. It is then used to initialize the OpenAI client, which handles the communication with the AI models.

### Where to get one?

You can get an `OPENAI_API_KEY` by signing up for an account at [platform.openai.com](https://platform.openai.com/).

## Other API Keys

The application also supports other AI providers (`google`, `openrouter`), which require their own respective API keys. These are passed directly in the API request from the frontend and are not configured as environment variables in the backend. The `OPENAI_API_KEY` is the only one that needs to be set up for the default configuration to work.
