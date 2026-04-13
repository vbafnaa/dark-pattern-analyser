"""
visual_analyzer/element_map_builder.py — Screenshot + DOM → ElementMap JSON.

Converts the raw screenshot and DOM metadata into a structured ElementMap
that can be sent to an LLM for reasoning, instead of sending the raw image.
"""

from __future__ import annotations

from visual_analyzer.interfaces import ElementMap, ElementMapEntry


# Default viewport dimensions (Chrome default)
DEFAULT_VIEWPORT_WIDTH = 1280.0
DEFAULT_VIEWPORT_HEIGHT = 720.0


def build_element_map(dom_metadata: dict[str, object]) -> ElementMap:
    """
    Build a structured ElementMap from DOM metadata.

    The ElementMap captures the spatial layout and visual properties of
    all interactive elements, making it suitable for LLM analysis
    without sending raw screenshot data.

    Args:
        dom_metadata: The dom_metadata portion of the analysis payload.

    Returns:
        An ElementMap with all positioned elements and their properties.
    """
    viewport_w = DEFAULT_VIEWPORT_WIDTH
    viewport_h = DEFAULT_VIEWPORT_HEIGHT
    viewport_area = viewport_w * viewport_h

    entries: list[ElementMapEntry] = []

    # Process all element lists
    for key in ("interactive_elements", "hidden_elements", "prechecked_inputs"):
        elements = dom_metadata.get(key, [])
        if not isinstance(elements, list):
            continue

        for el in elements:
            if not isinstance(el, dict):
                continue

            rect = el.get("bounding_rect", {})
            if not isinstance(rect, dict):
                continue

            styles = el.get("computed_styles", {})
            if not isinstance(styles, dict):
                continue

            width = float(rect.get("width", 0))
            height = float(rect.get("height", 0))
            el_area = width * height
            area_ratio = el_area / viewport_area if viewport_area > 0 else 0.0

            entries.append(
                ElementMapEntry(
                    selector=str(el.get("selector", "")),
                    tag_name=str(el.get("tag_name", "")),
                    text_content=str(el.get("text_content", "")),
                    x=float(rect.get("x", 0)),
                    y=float(rect.get("y", 0)),
                    width=width,
                    height=height,
                    color=str(styles.get("color", "")),
                    background_color=str(styles.get("background_color", "")),
                    font_size=str(styles.get("font_size", "")),
                    opacity=str(styles.get("opacity", "1")),
                    area_ratio=round(area_ratio, 6),
                )
            )

    url = str(dom_metadata.get("url", ""))

    return ElementMap(
        viewport_width=viewport_w,
        viewport_height=viewport_h,
        elements=entries,
        url=url,
    )


def element_map_to_prompt(element_map: ElementMap) -> str:
    """
    Convert an ElementMap to a text prompt suitable for LLM analysis.

    Returns a structured text description of the page layout that an
    LLM can reason about to detect visual dark patterns.
    """
    lines: list[str] = [
        f"Page URL: {element_map.url}",
        f"Viewport: {element_map.viewport_width}×{element_map.viewport_height}",
        f"Total elements: {len(element_map.elements)}",
        "",
        "Elements (sorted by position, top-to-bottom, left-to-right):",
        "",
    ]

    # Sort elements by y, then x
    sorted_elements = sorted(
        element_map.elements, key=lambda e: (e.y, e.x)
    )

    for i, el in enumerate(sorted_elements, 1):
        lines.append(
            f"[{i}] <{el.tag_name}> selector=\"{el.selector}\"\n"
            f"     text: \"{el.text_content[:100]}\"\n"
            f"     position: ({el.x:.0f}, {el.y:.0f}) size: {el.width:.0f}×{el.height:.0f}\n"
            f"     area_ratio: {el.area_ratio:.4f}\n"
            f"     color: {el.color} bg: {el.background_color}\n"
            f"     font-size: {el.font_size} opacity: {el.opacity}"
        )

    return "\n".join(lines)
