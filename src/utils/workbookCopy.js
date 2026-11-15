export function assertWorkbookCopy(source, copy, expectedTitle) {
  const sourceTabs = Object.keys(source).sort();
  const copyTabs = Object.keys(copy).sort();
  if (JSON.stringify(sourceTabs) !== JSON.stringify(copyTabs)) throw new Error('Copied workbook tabs differ from the source.');
  for (const tab of sourceTabs) {
    const original = source[tab];
    const actual = copy[tab];
    if (tab === '_meta') {
      const titleIndex = original[0]?.indexOf('title');
      if (titleIndex < 0 || actual[1]?.[titleIndex] !== expectedTitle) throw new Error('The copied file title was not saved in _meta.');
      const expected = original.map((row, index) => index === 1 ? row.map((value, field) => field === titleIndex ? expectedTitle : value) : row);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('Copied file metadata differs from the source.');
    } else if (JSON.stringify(original) !== JSON.stringify(actual)) {
      throw new Error(`Copied tab ${tab} differs from the source.`);
    }
  }
}
