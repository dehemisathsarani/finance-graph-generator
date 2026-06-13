from datetime import datetime
from pathlib import Path
import re

import matplotlib

matplotlib.use("Agg")

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from matplotlib.colors import LinearSegmentedColormap
from matplotlib.ticker import FormatStrFormatter


DEFAULT_SHEET_NAME = "Graph"
TITLE_MARKER = "Outstanding as of"


def excel_format_help(file_path):
    suffix = Path(file_path).suffix.lower()
    if suffix == ".xls":
        return (
            "Old .xls files need the xlrd package. Please save the workbook as .xlsx "
            "or install xlrd in the backend environment."
        )

    return "Please check that this is a valid Excel workbook."


def clean_text(value):
    if pd.isna(value):
        return np.nan

    text = str(value).replace("\xa0", " ").strip()
    return text if text else np.nan


def format_slot_label(value):
    if pd.isna(value):
        return np.nan

    if isinstance(value, str):
        text = value.replace("\xa0", " ").strip()

        if not text:
            return np.nan

        if text.lower().startswith("before"):
            return "Before 22"

        if "00:00:00" in text:
            text = text.split(" ")[0].strip()

        parsed_date = pd.to_datetime(text, errors="coerce")
        if pd.notna(parsed_date):
            return f"{parsed_date.day}-{parsed_date.strftime('%b')}"

        return text

    if isinstance(value, (pd.Timestamp, datetime, np.datetime64)):
        parsed_date = pd.to_datetime(value)
        return f"{parsed_date.day}-{parsed_date.strftime('%b')}"

    parsed_date = pd.to_datetime(value, errors="coerce")
    if pd.notna(parsed_date):
        return f"{parsed_date.day}-{parsed_date.strftime('%b')}"

    return str(value).strip()


def read_graph_sheet(file_path, sheet_name=DEFAULT_SHEET_NAME):
    try:
        return pd.read_excel(file_path, sheet_name=sheet_name, header=None)
    except ValueError as exc:
        raise ValueError(f'Could not find sheet "{sheet_name}" in this Excel file.') from exc
    except ImportError as exc:
        raise ValueError(excel_format_help(file_path)) from exc


def row_to_text(row):
    values = [str(value) for value in row.tolist() if pd.notna(value)]
    return " ".join(values).replace("\xa0", " ").strip()


def sheet_has_title(df_raw):
    for index in range(len(df_raw)):
        if TITLE_MARKER.lower() in row_to_text(df_raw.iloc[index]).lower():
            return True

    return False


def available_sheets(file_path):
    try:
        with pd.ExcelFile(file_path) as workbook:
            return workbook.sheet_names
    except ImportError as exc:
        raise ValueError(excel_format_help(file_path)) from exc


def find_candidate_sheets(file_path):
    sheet_names = available_sheets(file_path)
    normalized_default = DEFAULT_SHEET_NAME.lower()
    preferred = [
        sheet for sheet in sheet_names if sheet.strip().lower() == normalized_default
    ]
    remaining = [sheet for sheet in sheet_names if sheet not in preferred]
    ordered_sheets = preferred + remaining
    candidate_sheets = []

    for sheet in ordered_sheets:
        df_raw = read_graph_sheet(file_path, sheet)
        if sheet_has_title(df_raw):
            candidate_sheets.append((sheet, df_raw))

    return candidate_sheets


def list_graph_titles(file_path, sheet_name=None):
    sheet_frames = (
        [(sheet_name, read_graph_sheet(file_path, sheet_name))]
        if sheet_name
        else find_candidate_sheets(file_path)
    )
    titles = []
    seen = set()

    for current_sheet, df_raw in sheet_frames:
        for index in range(len(df_raw)):
            text = row_to_text(df_raw.iloc[index])
            if TITLE_MARKER.lower() not in text.lower():
                continue

            normalized = " ".join(text.split())
            key = f"{current_sheet.lower()}::{normalized.lower()}"
            if key not in seen:
                titles.append({"title": normalized, "row": index, "sheet": current_sheet})
                seen.add(key)

    return titles


def find_title_row(df_raw, target_title):
    target = target_title.lower().strip()

    for index in range(len(df_raw)):
        text = row_to_text(df_raw.iloc[index])
        if target in text.lower():
            return index, text

    raise ValueError(f"Could not find title: {target_title}")


def build_plot_data(df_raw, title_row):
    records = []

    for index in range(title_row + 1, len(df_raw)):
        age_slot = df_raw.iloc[index, 0] if 0 in df_raw.columns else None
        institute = df_raw.iloc[index, 1] if 1 in df_raw.columns else None
        amount = df_raw.iloc[index, 2] if 2 in df_raw.columns else None
        text = row_to_text(df_raw.iloc[index])

        if isinstance(age_slot, str) and age_slot.strip().lower() == "total":
            break

        if index > title_row + 1 and TITLE_MARKER.lower() in text.lower():
            break

        records.append([age_slot, institute, amount])

    block_df = pd.DataFrame(records, columns=["AgeSlot", "Institute", "Amount"])
    slot_sequence = []
    current_slot = None
    plot_rows = []

    for _, row in block_df.iterrows():
        raw_slot = row["AgeSlot"]
        institute = clean_text(row["Institute"])
        amount_raw = row["Amount"]

        if pd.notna(raw_slot):
            current_slot = format_slot_label(raw_slot)
            if len(slot_sequence) == 0 or slot_sequence[-1] != current_slot:
                slot_sequence.append(current_slot)

        amount = (
            pd.to_numeric(str(amount_raw).replace(",", "").strip(), errors="coerce")
            if pd.notna(amount_raw)
            else np.nan
        )

        if pd.notna(institute) and pd.notna(amount):
            plot_rows.append(
                {
                    "AgeSlotLabel": current_slot,
                    "Institute": institute,
                    "Amount": amount,
                    "Amount_Mn": amount / 1_000_000,
                }
            )

    plot_df = pd.DataFrame(plot_rows)
    if plot_df.empty:
        raise ValueError("No valid graph rows found below this title.")

    return slot_sequence, plot_df


def build_grouped_layout(slot_sequence, plot_df):
    bar_width = 0.22
    inner_gap = 0.14
    group_gap = 0.00
    min_group_width = 1.25

    color_map = LinearSegmentedColormap.from_list(
        "age_gradient",
        ["#8b0000", "#ff1f1f", "#efc7a8", "#f2ea3a"],
    )

    group_info = []
    plot_positions = []
    current_left = 0.0
    slot_count = len(slot_sequence)

    for index, slot in enumerate(slot_sequence):
        group = plot_df[plot_df["AgeSlotLabel"] == slot].copy().reset_index(drop=True)
        bar_count = len(group)
        total_bar_area = (
            bar_count * bar_width + (bar_count - 1) * inner_gap if bar_count > 0 else 0
        )
        extra_padding = 0.40 + max(0, bar_count - 2) * 0.18
        group_width = max(total_bar_area + extra_padding, min_group_width)
        center = current_left + group_width / 2
        right = current_left + group_width

        group_info.append(
            {
                "slot": slot,
                "left": current_left,
                "right": right,
                "center": center,
                "n_bars": bar_count,
            }
        )

        color = color_map(index / max(slot_count - 1, 1))

        if bar_count > 0:
            start_x = center - total_bar_area / 2 + bar_width / 2
            x_positions = [
                start_x + item_index * (bar_width + inner_gap)
                for item_index in range(bar_count)
            ]

            for item_index in range(bar_count):
                row = group.iloc[item_index].copy()
                row["x"] = x_positions[item_index]
                row["color"] = color
                row["group_center"] = center
                row["n_in_group"] = bar_count
                plot_positions.append(row)

        current_left = right + group_gap

    return (
        pd.DataFrame(plot_positions),
        pd.DataFrame(group_info),
        bar_width,
    )


def clean_chart_title(title_text):
    return re.sub(r"(\d+)(st|nd|rd|th)", r"\1", title_text)


def safe_filename(text):
    name = re.sub(r"[^A-Za-z0-9._-]+", "_", text.strip()).strip("_")
    return name[:120] or "finance_graph"


def render_graph(file_path, target_title, output_dir, sheet_name=None):
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    if sheet_name:
        df_raw = read_graph_sheet(file_path, sheet_name)
        title_row, title_text = find_title_row(df_raw, target_title)
        resolved_sheet = sheet_name
    else:
        title_row = None
        title_text = None
        df_raw = None
        resolved_sheet = None

        for current_sheet, current_df in find_candidate_sheets(file_path):
            try:
                title_row, title_text = find_title_row(current_df, target_title)
                df_raw = current_df
                resolved_sheet = current_sheet
                break
            except ValueError:
                continue

        if df_raw is None or title_row is None:
            raise ValueError(f"Could not find title: {target_title}")

    slot_sequence, plot_df = build_plot_data(df_raw, title_row)
    plot_df2, group_df, bar_width = build_grouped_layout(slot_sequence, plot_df)

    chart_title = clean_chart_title(title_text)
    figure, axis = plt.subplots(figsize=(28, 14))
    figure.patch.set_facecolor("#f2f2f2")
    axis.set_facecolor("#f2f2f2")

    axis.bar(
        plot_df2["x"],
        plot_df2["Amount_Mn"],
        width=bar_width,
        color=plot_df2["color"],
        edgecolor=plot_df2["color"],
    )

    for _, row in plot_df2.iterrows():
        axis.text(
            row["x"],
            row["Amount_Mn"] + 0.15,
            f"{row['Amount_Mn']:.2f}",
            ha="center",
            va="bottom",
            fontsize=8,
            fontweight="bold",
            color="black",
        )

    panel_top = 0.0
    panel_bottom = -11.25
    university_label_y = -0.05
    month_label_y = -9.75
    y_max = plot_df2["Amount_Mn"].max() + 2
    left_edge = group_df.iloc[0]["left"]
    right_edge = group_df.iloc[-1]["right"]

    axis.set_xlim(left_edge, right_edge)
    axis.set_ylim(panel_bottom, y_max)
    axis.set_xticks([])
    axis.set_ylabel("Millions", fontsize=11, fontweight="bold")
    axis.set_title(chart_title, fontsize=20, fontweight="bold", color="#555555")
    axis.set_yticks(np.arange(0, int(np.ceil(y_max)) + 1, 1))
    axis.yaxis.set_major_formatter(FormatStrFormatter("%d"))
    axis.grid(axis="y", linestyle="-", alpha=0.22, color="gray")
    axis.spines["top"].set_visible(False)
    axis.spines["right"].set_visible(False)

    axis.hlines(panel_top, xmin=left_edge, xmax=right_edge, color="#c6c6c6", linewidth=1.5)
    axis.hlines(
        panel_bottom,
        xmin=left_edge,
        xmax=right_edge,
        color="#c6c6c6",
        linewidth=1.5,
    )

    for _, group in group_df.iterrows():
        axis.vlines(
            group["left"],
            ymin=panel_bottom,
            ymax=panel_top,
            color="#c6c6c6",
            linewidth=1.5,
        )

    axis.vlines(
        right_edge,
        ymin=panel_bottom,
        ymax=panel_top,
        color="#c6c6c6",
        linewidth=1.5,
    )

    for _, row in plot_df2.iterrows():
        axis.text(
            row["x"],
            university_label_y,
            str(row["Institute"]),
            rotation=90,
            ha="center",
            va="top",
            fontsize=8,
            fontweight="bold",
            color="black",
            clip_on=False,
        )

    for _, group in group_df.iterrows():
        axis.text(
            group["center"],
            month_label_y,
            str(group["slot"]),
            ha="center",
            va="top",
            fontsize=10,
            fontweight="bold",
            color="black",
            clip_on=False,
        )

    plt.subplots_adjust(left=0.06, right=0.995, top=0.92, bottom=0.42)

    base_name = safe_filename(chart_title)
    png_path = output_path / f"{base_name}.png"
    pdf_path = output_path / f"{base_name}.pdf"

    figure.savefig(png_path, dpi=180, bbox_inches="tight", facecolor=figure.get_facecolor())
    figure.savefig(pdf_path, bbox_inches="tight", facecolor=figure.get_facecolor())
    plt.close(figure)

    return {
        "title": chart_title,
        "png": png_path,
        "pdf": pdf_path,
        "rows": int(len(plot_df2)),
        "groups": int(len(group_df)),
        "sheet": resolved_sheet,
    }
