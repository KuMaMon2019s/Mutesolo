FROM python:3.12-slim

WORKDIR /app

# Install dependencies
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# Copy source code
COPY server.py .

# Expose MCP streamable-http port
EXPOSE 8001

# Start fastMCP server (streamable-http transport)
CMD ["fastmcp", "run", "server.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8001"]
