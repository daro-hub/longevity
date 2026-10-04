// Resolves a character offset in a document's concatenated text back to
// the page(s) it came from.
//
// Ported from app/rag/paging.py.

export function createPageMap (pages, separator = '\n\n') {
  const pageLengths = pages.map((p) => p.length)
  const separatorLen = separator.length

  return Object.freeze({
    pageLengths,
    separatorLen,

    /** Returns the 1-indexed page number containing charOffset. */
    pageForOffset (charOffset) {
      if (charOffset < 0) throw new Error('charOffset must be >= 0')
      let cursor = 0
      for (let i = 0; i < pageLengths.length; i++) {
        const pageEnd = cursor + pageLengths[i]
        if (charOffset < pageEnd) return i + 1
        cursor = pageEnd + separatorLen
      }
      // Offset past the end (e.g. exactly at the document's final
      // character, or a chunk boundary rounding to the last index) --
      // clamp to the last page rather than throwing.
      return pageLengths.length
    },

    /** Returns [pageStart, pageEnd] for a [start, end) character span. */
    pageRangeForSpan (start, end) {
      const pageStart = this.pageForOffset(start)
      const pageEnd = this.pageForOffset(Math.max(start, end - 1))
      return [pageStart, pageEnd]
    }
  })
}

export function concatenatedText (pages, separator = '\n\n') {
  return pages.join(separator)
}
