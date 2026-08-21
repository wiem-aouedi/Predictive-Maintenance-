import { createRoot } from 'react-dom/client'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import PdfReportTemplate from '../components/PdfReportTemplate'

/**
 * Renders PdfReportTemplate off-screen, rasterizes it, and slices the
 * result across A4 pages. Off-screen (not display:none) so it still lays
 * out and paints normally -- html2canvas needs real geometry to capture.
 */
export async function exportMessagePdf({ question, answer, chartImages, provenance, filename }) {
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    await new Promise((resolve) => {
      root.render(
        <PdfReportTemplate
          question={question}
          answer={answer}
          chartImages={chartImages}
          provenance={provenance}
          generatedAt={new Date()}
        />
      )
      // Two rAFs: one for React to commit the DOM, one for the browser to paint it.
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    const target = container.firstElementChild
    const images = Array.from(target.querySelectorAll('img'))
    await Promise.all(images.map((img) => img.decode().catch(() => {})))

    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' })
    const pageWidth = pdf.internal.pageSize.getWidth()
    const pageHeight = pdf.internal.pageSize.getHeight()
    const margin = 24
    const usableHeight = pageHeight - margin * 2
    const imgWidth = pageWidth - margin * 2
    const imgHeight = (canvas.height * imgWidth) / canvas.width
    const imgData = canvas.toDataURL('image/png')

    let heightLeft = imgHeight
    let position = margin
    pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
    heightLeft -= usableHeight

    while (heightLeft > 0) {
      position -= usableHeight
      pdf.addPage()
      pdf.addImage(imgData, 'PNG', margin, position, imgWidth, imgHeight)
      heightLeft -= usableHeight
    }

    pdf.save(filename)
  } finally {
    root.unmount()
    container.remove()
  }
}
