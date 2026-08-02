from mcp.server.fastmcp import FastMCP

# Create the MCP server
mcp = FastMCP(
    name="Predictive Maintenance Server",
    
)
print("Creating MCP server")
#importing the register functions from tools.py 
from mcp_server.tools import register_tools
from mcp_server.resources import register_resources
from mcp_server.prompts import register_prompts

register_tools(mcp)
register_resources(mcp)
register_prompts(mcp)
print("Starting MCP server")

if __name__ == "__main__":
    mcp.run()