'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { getTools } from '@/lib/growth-tools';

export default function ToolPage() {
  const params = useParams();
  const toolName = params.tool as string;
  const tools = getTools();
  const tool = tools.find((t) => t.name === toolName);

  if (!tool) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <p className="text-muted">Tool not found</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <header className="border-b border-line px-6 py-4">
        <h1 className="text-lg font-semibold text-foreground">{tool.label}</h1>
        <p className="text-sm text-muted mt-1">{tool.description}</p>
      </header>
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="text-center space-y-4">
          <p className="text-muted">Tool shell — coming soon</p>
        </div>
      </div>
    </div>
  );
}
