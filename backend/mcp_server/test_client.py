import asyncio
from pprint import pprint

from mcp.shared.memory import create_connected_server_and_client_session

from mcp_server.server import mcp


def get_result_list(result):
    """
    Extract the actual list returned by an MCP tool.
    """
    return result.structuredContent["result"]


def print_snapshot(title, result):
    print(f"\n{'=' * 60}")
    print(title)
    print("=" * 60)

    for row in get_result_list(result):
        print(
            f"{row['timestamp']} | "
            f"Status={row.get('status')} | "
            f"Failure={row.get('failure')} | "
            f"Degradation={row.get('degradation'):.3f}"
        )


async def main():

    async with create_connected_server_and_client_session(mcp) as client:

        # ======================================================
        # Registered tools
        # ======================================================

        tools = await client.list_tools()

        print("\nRegistered tools\n")

        for tool in tools.tools:
            print("-", tool.name)

        # ======================================================
        # List machines
        # ======================================================

        machines = await client.call_tool(
            "list_machines",
            {},
        )

        print(f"\nTotal machines : {len(get_result_list(machines))}")

        # ======================================================
        # Machine details
        # ======================================================

        details = await client.call_tool(
            "get_machine_details",
            {
                "machine_id": 1,
            },
        )

        print("\nMachine details")
        pprint(details.structuredContent)

        # ======================================================
        # Sensor history
        # ======================================================

        early_snapshot = await client.call_tool(
            "get_machine_sensor_history",
            {
                "machine_id": 1,
                "limit": 5,
                "as_of_timestamp": "2025-06-01 00:00:00",
            },
        )

        print_snapshot(
            "Machine 1 @ 2025-06-01",
            early_snapshot,
        )

        late_snapshot = await client.call_tool(
            "get_machine_sensor_history",
            {
                "machine_id": 1,
                "limit": 5,
                "as_of_timestamp": "2026-01-15 00:00:00",
            },
        )

        print_snapshot(
            "Machine 1 @ 2026-01-15",
            late_snapshot,
        )

        # ======================================================
        # Fleet summary
        # ======================================================

        early_ts = "2025-08-01 00:00:00"
        late_ts = "2026-02-05 00:00:00"

        summary = await client.call_tool(
            "get_fleet_health_summary",
            {
                "as_of_timestamp": early_ts,
            },
        )

        print("\nFleet summary (early)")
        pprint(summary.structuredContent)

        summary = await client.call_tool(
            "get_fleet_health_summary",
            {
                "as_of_timestamp": late_ts,
            },
        )

        print("\nFleet summary (late)")
        pprint(summary.structuredContent)

        # ======================================================
        # Machines by status
        # ======================================================

        failed = await client.call_tool(
            "list_machines_by_status",
            {
                "status": "failed",
                "as_of_timestamp": late_ts,
            },
        )

        print(
            f"\nFailed machines by {late_ts}: "
            f"{len(get_result_list(failed))}"
        )

        # ======================================================
        # Trend analysis
        # ======================================================

        trend = await client.call_tool(
            "analyze_sensor_trends",
            {
                "machine_id": 1,
            },
        )

        print("\nCurrent trends")
        pprint(trend.structuredContent)

        historical_trend = await client.call_tool(
            "analyze_sensor_trends",
            {
                "machine_id": 1,
                "window": 168,
                "as_of_timestamp": "2025-10-01 00:00:00",
            },
        )

        print("\nHistorical trends")
        pprint(historical_trend.structuredContent)

        # ======================================================
        # Failure prediction
        # ======================================================

        prediction = await client.call_tool(
            "predict_failure_next_168h",
            {
                "machine_id": 1,
            },
        )

        print("\nLatest prediction")
        pprint(prediction.structuredContent)

        historical_prediction = await client.call_tool(
            "predict_failure_next_168h",
            {
                "machine_id": 1,
                "as_of_timestamp": "2025-10-01 00:00:00",
            },
        )

        print("\nHistorical prediction")
        pprint(historical_prediction.structuredContent)

        insufficient_history = await client.call_tool(
            "predict_failure_next_168h",
            {
                "machine_id": 1,
                "as_of_timestamp": "2025-01-01 05:00:00",
            },
        )

        print("\nPrediction with insufficient history")
        pprint(insufficient_history.structuredContent)

        # ======================================================
        # Second machine
        # ======================================================

        prediction = await client.call_tool(
            "predict_failure_next_168h",
            {
                "machine_id": 35,
            },
        )

        print("\nMachine 35 prediction")
        pprint(prediction.structuredContent)


if __name__ == "__main__":
    asyncio.run(main())