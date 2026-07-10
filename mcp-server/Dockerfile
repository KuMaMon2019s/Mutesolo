FROM python:3.12-slim

WORKDIR /app

# 安装依赖
COPY pyproject.toml .
RUN pip install --no-cache-dir .

# 复制源码
COPY server.py .

# 暴露 MCP streamable-http 端口
EXPOSE 8001

# 启动 fastMCP server（streamable-http transport）
CMD ["fastmcp", "run", "server.py", "--transport", "streamable-http", "--host", "0.0.0.0", "--port", "8001"]
