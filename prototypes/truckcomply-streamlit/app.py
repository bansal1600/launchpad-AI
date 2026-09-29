"""TruckComply - Streamlit demo app.

Runs entirely on data/mock_compliance.json and data/sample_profiles.json.
No LLM calls, no web requests, no database, no login.
"""

from datetime import date

import pandas as pd
import streamlit as st

import engine

st.set_page_config(page_title="TruckComply", page_icon="\U0001F69A", layout="wide")

st.warning("DEMO MODE: mock data, illustrative only.")

data = engine.load_data()
profiles = engine.load_profiles()

st.title("\U0001F69A TruckComply")
st.caption(
    "See the permits, restrictions, and rough timeline for a food truck, "
    "built from a small mock compliance dataset."
)

EMPLOYEES_OPTIONS = ["none", "1-5", "6+"]
STRUCTURE_OPTIONS = ["sole proprietor", "LLC", "partnership"]
SELL_WHERE_OPTIONS = engine.SELL_WHERE_KEYS

# ---------------------------------------------------------------------------
# Sample profile prefill
# ---------------------------------------------------------------------------

st.header("Tell us about your food truck")

profile_labels = ["\u2014 Select a sample profile \u2014"] + [p["label"] for p in profiles]
selected_label = st.selectbox("Load a sample profile", profile_labels)

selected_profile = None
if selected_label != profile_labels[0]:
    selected_profile = next(p for p in profiles if p["label"] == selected_label)


def prefill(key, fallback):
    if selected_profile is not None:
        return selected_profile.get(key, fallback)
    return fallback


# ---------------------------------------------------------------------------
# Input form
# ---------------------------------------------------------------------------

col1, col2, col3 = st.columns(3)
with col1:
    city = st.text_input("City *", value=prefill("city", ""))
with col2:
    county = st.text_input("County *", value=prefill("county", ""))
with col3:
    state = st.text_input("State *", value=prefill("state", ""))

serves = st.text_input("What you'll serve *", value=prefill("serves", ""))

st.subheader("Tell us more")
cbox1, cbox2 = st.columns(2)
with cbox1:
    hazardous_food = st.checkbox(
        "Serves meat/dairy/eggs (hazardous food)", value=prefill("hazardous_food", False)
    )
    alcohol = st.checkbox("Serves alcohol", value=prefill("alcohol", False))
    propane_generator = st.checkbox(
        "Uses propane/generator", value=prefill("propane_generator", False)
    )
with cbox2:
    packaged = st.checkbox("Sells packaged items", value=prefill("packaged", False))
    late_night = st.checkbox("Late-night hours", value=prefill("late_night", False))
    multi_jurisdiction = st.checkbox(
        "Operating in more than one city or county", value=prefill("multi_jurisdiction", False)
    )

col4, col5 = st.columns(2)
with col4:
    employees = st.selectbox(
        "Employees", EMPLOYEES_OPTIONS, index=EMPLOYEES_OPTIONS.index(prefill("employees", "none"))
    )
with col5:
    structure = st.selectbox(
        "Business structure",
        STRUCTURE_OPTIONS,
        index=STRUCTURE_OPTIONS.index(prefill("structure", "sole proprietor")),
    )

sell_where = st.multiselect(
    "Where you'll sell", SELL_WHERE_OPTIONS, default=prefill("sell_where", [])
)

start_date_input = st.date_input("Planned start date", value=date.today())

scan_clicked = st.button("Scan requirements, restrictions, and timeline", type="primary")

if scan_clicked:
    missing_fields = []
    if not city.strip():
        missing_fields.append("City")
    if not county.strip():
        missing_fields.append("County")
    if not state.strip():
        missing_fields.append("State")
    if not serves.strip():
        missing_fields.append("What you'll serve")

    if missing_fields:
        st.error(
            "Please fill in " + ", ".join(missing_fields) + " so we know what to scan for."
        )
    else:
        st.session_state["inputs"] = {
            "city": city.strip(),
            "county": county.strip(),
            "state": state.strip(),
            "serves": serves.strip(),
            "hazardous_food": hazardous_food,
            "alcohol": alcohol,
            "propane_generator": propane_generator,
            "packaged": packaged,
            "late_night": late_night,
            "multi_jurisdiction": multi_jurisdiction,
            "employees": employees,
            "structure": structure,
            "sell_where": sell_where,
            "start_date": start_date_input,
        }

if "inputs" not in st.session_state:
    st.info("Fill in the required fields (or load a sample profile) and click the button above.")
    st.stop()

inputs = st.session_state["inputs"]

if not engine.is_known_jurisdiction(inputs["city"], inputs["state"], profiles):
    st.warning("Demo data is generic. Real mode will look up your exact jurisdiction.")

st.divider()

# ---------------------------------------------------------------------------
# Compute
# ---------------------------------------------------------------------------

conditions = engine.build_conditions(inputs)
requirements = engine.get_requirements(data, conditions)
restrictions = engine.get_restrictions(data, conditions)
engine.attach_restrictions(requirements, restrictions)
roadmap = engine.compute_roadmap(data, conditions, inputs["start_date"])
req_by_id = {r["id"]: r for r in requirements}

st.caption(
    f"Showing results for **{inputs['serves']}** in **{inputs['city']}, {inputs['county']}, "
    f"{inputs['state']}**, starting **{inputs['start_date'].strftime('%b %d, %Y')}**."
)

# ---------------------------------------------------------------------------
# 1. Summary
# ---------------------------------------------------------------------------

st.header("1. Summary")

lvl_counts = engine.level_counts(requirements)
sev_counts = engine.severity_counts(restrictions)

sc1, sc2 = st.columns(2)
with sc1:
    st.markdown("**Requirements by level**")
    for level in ("federal", "state", "county", "city"):
        st.write(f"- {level.capitalize()}: {lvl_counts.get(level, 0)}")
with sc2:
    st.markdown("**Restrictions by severity**")
    for sev in ("hard limit", "common violation", "advisory"):
        st.write(f"- {sev.capitalize()}: {sev_counts.get(sev, 0)}")

if roadmap["weeks_min"] is not None:
    st.metric(
        "Estimated time to go live",
        f"{roadmap['weeks_min']} to {roadmap['weeks_max']} weeks",
    )

st.markdown("**Estimated cost, by cost type**")
cost_data = engine.cost_summary(requirements)
if cost_data:
    cost_rows = [
        {"Cost type": ct, "Low": vals["min"], "High": vals["max"]}
        for ct, vals in cost_data.items()
    ]
    st.dataframe(pd.DataFrame(cost_rows), use_container_width=True, hide_index=True)
else:
    st.write("No costed requirements apply.")

# ---------------------------------------------------------------------------
# 2. Your path to go live
# ---------------------------------------------------------------------------

st.header("2. Your path to go live")

steps_by_phase = {}
for s in roadmap["steps"]:
    steps_by_phase.setdefault(s["phase_id"], []).append(s)

for phase in roadmap["phases"]:
    phase_steps = steps_by_phase.get(phase["id"], [])
    if not phase_steps:
        continue
    st.subheader(phase["name"])
    for step in phase_steps:
        done_key = f"done_{step['id']}"
        title = step["name"]
        if step["is_critical"]:
            title += " \u2b50"
        with st.expander(title, expanded=False):
            st.write(step["what_to_do"])
            st.write(f"**Owner:** {step['owner']}")
            st.write(f"**Duration:** {step['days_min']}\u2013{step['days_max']} days")
            st.write(
                f"**Fast case:** starts day {step['fast_start']} "
                f"({step['fast_start_date'].strftime('%b %d, %Y')}), "
                f"finishes day {step['fast_finish']} "
                f"({step['fast_finish_date'].strftime('%b %d, %Y')})"
            )
            st.write(
                f"**Slow case:** starts day {step['slow_start']} "
                f"({step['slow_start_date'].strftime('%b %d, %Y')}), "
                f"finishes day {step['slow_finish']} "
                f"({step['slow_finish_date'].strftime('%b %d, %Y')})"
            )
            if step["depends_on_names"]:
                st.write("**Depends on:** " + ", ".join(step["depends_on_names"]))
            else:
                st.write("**Depends on:** nothing \u2014 can start right away")
            if step["requirement_names"]:
                st.write("**Linked permits:** " + ", ".join(step["requirement_names"]))
            st.write(f"**Tip:** {step['tip']}")
            if step["is_critical"]:
                st.info("This step sets your timeline")
            if step["is_non_blocking"]:
                st.caption("This step does not block going live \u2014 it can finish after launch.")
            st.checkbox("Done", key=done_key)

st.subheader("Timeline chart (weeks)")
chart_rows = []
for s in roadmap["steps"]:
    fast_weeks = s["days_min"] / 7
    extra_weeks = max(s["days_max"] - s["days_min"], 0) / 7
    chart_rows.append(
        {"Step": s["name"], "Fast case (weeks)": fast_weeks, "Extra to slow case (weeks)": extra_weeks}
    )
chart_df = pd.DataFrame(chart_rows).set_index("Step")
try:
    st.bar_chart(chart_df, horizontal=True, use_container_width=True)
except TypeError:
    st.bar_chart(chart_df, use_container_width=True)
st.caption(
    "Bars show each step's fast-case duration, extended by how much longer the slow case could take."
)

if roadmap["critical_path_names"]:
    st.markdown("**Critical path (sets the go-live date):** " + " \u2192 ".join(roadmap["critical_path_names"]))

if roadmap["separate_finish"]:
    st.markdown("**Can finish after launch:**")
    for info in roadmap["separate_finish"].values():
        st.write(
            f"- {info['name']}: fast case day {info['fast_finish']}, slow case day {info['slow_finish']}"
        )

# ---------------------------------------------------------------------------
# 3. What you can do in parallel right now
# ---------------------------------------------------------------------------

st.header("3. What you can do in parallel right now")

done_ids = {s["id"] for s in roadmap["steps"] if st.session_state.get(f"done_{s['id']}")}
ready_steps = engine.parallel_now(roadmap["steps"], done_ids)

if ready_steps:
    for s in ready_steps:
        st.write(f"- **{s['name']}** ({s['phase_name']}) \u2014 {s['owner']}")
else:
    st.write("Nothing is ready to start \u2014 check off finished steps above.")

# ---------------------------------------------------------------------------
# 4. Requirements checklist
# ---------------------------------------------------------------------------

st.header("4. Requirements checklist")

LEVEL_ORDER = ["federal", "state", "county", "city"]
reqs_by_level = {}
for r in requirements:
    reqs_by_level.setdefault(r["level"], []).append(r)

for level in LEVEL_ORDER:
    level_reqs = reqs_by_level.get(level, [])
    if not level_reqs:
        continue
    st.subheader(level.capitalize())
    for r in level_reqs:
        card_title = r["name"]
        if r["missing_prereq_names"]:
            card_title += " \u26a0\ufe0f prerequisite not selected"
        with st.expander(card_title):
            st.write(f"**Agency:** {r['agency']}")
            st.write(f"**Cost:** {r['cost']}")
            st.write(f"**Timeline:** {r['timeline']}")
            st.write(
                "**Prerequisites:** "
                + (", ".join(r["prereq_names"]) if r["prereq_names"] else "None")
            )
            if r["missing_prereq_names"]:
                st.warning(
                    "Prerequisite not selected: " + ", ".join(r["missing_prereq_names"])
                )
            st.write(f"**Renewal:** {r['renewal']}")
            st.write(f"**Note:** {r['note']}")
            if r["restrictions"]:
                with st.expander("Restrictions that apply", expanded=False):
                    for rest in r["restrictions"]:
                        st.write(f"- **{rest['rule']}** ({rest['severity']})")

# ---------------------------------------------------------------------------
# 5. What you cannot do
# ---------------------------------------------------------------------------

st.header("5. What you cannot do")

SEVERITY_BADGE = {
    "hard limit": "\U0001F534 hard limit",
    "common violation": "\U0001F7E0 common violation",
    "advisory": "\u26AA advisory",
}

restrictions_grouped = engine.restrictions_by_category(restrictions)
for category, items in restrictions_grouped.items():
    st.subheader(category)
    for r in items:
        with st.container(border=True):
            st.write(f"**{r['rule']}**")
            st.write(f"Level: `{r['level']}` \u2014 {SEVERITY_BADGE.get(r['severity'], r['severity'])}")
            st.write(f"**Penalty:** {r['penalty']}")
            st.write(f"**How to verify:** {r['verify']}")

# ---------------------------------------------------------------------------
# 6. Restrictions to check for each selling location
# ---------------------------------------------------------------------------

st.header("6. Restrictions to check for each selling location")

if inputs["sell_where"]:
    channel_map = engine.restrictions_by_channel(restrictions, inputs["sell_where"])
    for channel, items in channel_map.items():
        st.subheader(channel.replace("_", " ").title())
        if items:
            for r in items:
                st.write(f"- {r['rule']} ({SEVERITY_BADGE.get(r['severity'], r['severity'])})")
        else:
            st.write("No restrictions apply for this channel.")
else:
    st.write("Select at least one selling location above to see channel-specific restrictions.")

# ---------------------------------------------------------------------------
# 7. Top mistakes to avoid
# ---------------------------------------------------------------------------

st.header("7. Top mistakes to avoid")

mistakes = engine.top_mistakes(restrictions)
if mistakes:
    for r in mistakes:
        st.write(f"- **{r['rule']}** \u2014 penalty: {r['penalty']}")
else:
    st.write("No common-violation restrictions apply to your selections.")

if data.get("enforcement_notes"):
    st.markdown("**Enforcement notes**")
    for note in data["enforcement_notes"]:
        st.write(f"- {note}")

# ---------------------------------------------------------------------------
# 8. Renewals table
# ---------------------------------------------------------------------------

st.header("8. Renewals")

renewals = engine.renewals_table(requirements)
if renewals:
    st.dataframe(pd.DataFrame(renewals), use_container_width=True, hide_index=True)
else:
    st.write("No renewals apply.")

# ---------------------------------------------------------------------------
# 9. Inspection prep and questions for agencies
# ---------------------------------------------------------------------------

st.header("9. Inspection prep and questions to ask each agency")

col6, col7 = st.columns(2)
with col6:
    st.subheader("Inspection prep checklist")
    for item in data.get("inspection_prep", []):
        st.checkbox(item, key=f"prep_{item}")
with col7:
    st.subheader("Questions to ask each agency")
    for q in data.get("questions_for_agencies", []):
        st.write(f"- {q}")

# ---------------------------------------------------------------------------
# 10. Confirm before you rely on this
# ---------------------------------------------------------------------------

st.header("10. Confirm before you rely on this")
st.info(data.get("disclaimer", "DEMO DATA: illustrative only."))
st.write(
    "All requirements, restrictions, fees, and timelines above come from a small mock "
    "dataset for demo purposes. Verify every fee, form, and deadline with the actual "
    "federal, state, county, and city agencies before you rely on this plan."
)
