"""Run a scripted Flower Chat conversation against a SuperLink, non-interactively.

Does what `flwr chat` + `/load .` does, but sends a fixed list of messages in one
conversation series and writes a readable transcript. Handy for demos and smoke tests.

    FLWR_CHAT_SUPERLINK=local-agent uv run python scripts/chat_demo.py "Café at ..." "APPROVE" "remind me"
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from flwr.cli.chat.chat_app import parse_task_event, start_chat_run
from flwr.cli.chat.chat_local_agent import build_local_agent
from flwr.cli.constant import (
    CHAT_FAILURE_EVENTS, CHAT_REASONING_DELTA_EVENT, CHAT_TERMINAL_EVENTS, CHAT_TEXT_DELTA_EVENT,
    CHAT_TOOL_CALL_COMPLETED_EVENT, CHAT_TOOL_CALL_STARTED_EVENT,
)
from flwr.cli.flower_config import read_superlink_connection
from flwr.cli.utils import init_http_client_from_connection
from flwr.proto.control_pb2 import StreamRunEventsRequest  # pylint: disable=no-name-in-module


def main(messages: list[str]) -> None:
    connection = read_superlink_connection(os.environ.get("FLWR_CHAT_SUPERLINK", "local-agent"))
    stub = init_http_client_from_connection(connection)
    agent = build_local_agent(Path(__file__).resolve().parents[1])
    series_id = None
    lines = [f"# Comply Cofounder: Flower Chat transcript\n\n_App: {agent.app_spec} (local) · {time.strftime('%Y-%m-%d %H:%M')}_\n"]
    for msg in messages:
        print(f"\n❯ {msg}\n", flush=True)
        lines.append(f"\n---\n\n**❯ {msg}**\n")
        started = time.monotonic()
        run_id, series_id = start_chat_run(stub, msg, connection.federation, series_id, agent.app_spec, agent.fab_hash, agent.fab_content)
        progress, answer, tools = [], [], []
        for res in stub.StreamRunEvents(StreamRunEventsRequest(run_id=run_id)):
            kind, payload = parse_task_event(res.task_event)
            if kind == CHAT_REASONING_DELTA_EVENT:
                progress.append(payload.get("delta", "")); print(payload.get("delta", ""), end="", flush=True)
            elif kind == CHAT_TEXT_DELTA_EVENT:
                answer.append(payload.get("delta", ""))
            elif kind == CHAT_TOOL_CALL_STARTED_EVENT:
                tools.append(str(payload.get("connector_ref") or payload.get("name") or "tool"))
            elif kind == CHAT_TOOL_CALL_COMPLETED_EVENT:
                pass
            elif kind in CHAT_FAILURE_EVENTS:
                answer.append(f"\n**Run failed:** {payload.get('message') or payload}")
                break
            elif kind in CHAT_TERMINAL_EVENTS:
                break
        took = time.monotonic() - started
        text = "".join(answer).strip()
        print("\n" + text + f"\n\n({took:.0f}s)", flush=True)
        if progress:
            lines.append("\n<details><summary>Agents at work</summary>\n\n```\n" + "".join(progress).strip() + "\n```\n</details>\n")
        lines.append(f"\n{text}\n\n_{took:.0f}s · connector calls: {', '.join(tools) or 'none'}_\n")
    out = Path(__file__).resolve().parents[1] / "demo_transcript.md"
    out.write_text("".join(lines))
    print(f"\nTranscript saved to {out}")


if __name__ == "__main__":
    main(sys.argv[1:] or ["I'm opening a café at 87 N San Pedro St, San Jose, CA 95110", "APPROVE", "remind me"])
