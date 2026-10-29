import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

/** Keep parallel labels separate while deriving every line from its real relation. */
export function RelationEdge(props: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath(props);
  const offset = typeof props.data?.labelOffset === 'number' ? props.data.labelOffset : 0;
  return (
    <BaseEdge
      id={props.id}
      path={path}
      markerEnd={props.markerEnd}
      style={props.style}
      interactionWidth={20}
      label={props.label}
      labelX={labelX}
      labelY={labelY + offset}
      labelStyle={props.labelStyle}
      labelShowBg={props.labelShowBg}
      labelBgStyle={props.labelBgStyle}
      labelBgPadding={props.labelBgPadding}
      labelBgBorderRadius={props.labelBgBorderRadius}
    />
  );
}
