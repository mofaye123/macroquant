"use client";

import { ModulePageTemplate } from "@/components/layout/module-page-template";
import { useMacroData } from "@/lib/use-macro-data";

export default function ModuleAPage() {
  const dataState = useMacroData();
  return <ModulePageTemplate data={dataState.payload.modules.a} dataState={dataState} />;
}
