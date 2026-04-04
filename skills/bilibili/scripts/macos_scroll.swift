#!/usr/bin/env swift

import CoreGraphics
import Foundation

let args = CommandLine.arguments
guard args.count >= 2, let lines = Int32(args[1]) else {
  fputs("Usage: macos_scroll.swift <lines>\n", stderr)
  exit(2)
}

guard let event = CGEvent(
  scrollWheelEvent2Source: nil,
  units: .line,
  wheelCount: 1,
  wheel1: lines,
  wheel2: 0,
  wheel3: 0
) else {
  fputs("failed to create scroll event\n", stderr)
  exit(1)
}

event.post(tap: .cghidEventTap)
