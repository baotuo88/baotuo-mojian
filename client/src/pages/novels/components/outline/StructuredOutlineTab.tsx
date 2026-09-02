import StructuredOutlineWorkspace from "./StructuredOutlineWorkspace";
import type { StructuredTabViewProps } from "../workspace/NovelEditView.types.ts";

export default function StructuredOutlineTab(props: StructuredTabViewProps) {
  return <StructuredOutlineWorkspace {...props} />;
}
