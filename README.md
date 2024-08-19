# ArXs public API code samples (In Development)
This repository provides examples of how to interact with the ArXs public API.

*Note: The ArXs public API is currently in its alpha stage, and as such, it may undergo breaking changes.*

## OpenAPI spec
You can view the API specification here: https://api.arxs.be/swagger/index.html

## Authentication
To access the API, you must include a JWT token as a Bearer token in the Authorization header.

### How to Obtain a JWT Token
1. If you have the 'Admin' role, you can manage API keys for various client integrations from your user profile page.
2. Use the generated API key to request a JWT token by making a GET request to: https://identity.arxs.be/api/authenticate/token/{apiKey}. Ensure the TenantId header is set to your tenantId (usually your domain name without the dots, e.g., customer.arxs.be -> customerarxsbe).
3. The response will include a JWT token, which you can then use to authenticate your API calls. Add an Authorization header with "Bearer {jwt-token}".


## Current samples
- A node implementation to create a task request.