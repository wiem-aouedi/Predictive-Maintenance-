import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

const LABEL_STYLE = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#5d746f',
  marginBottom: 6,
}

export default function PdfReportTemplate({ question, answer, chartImages, provenance, generatedAt }) {
  return (
    <div
      style={{
        width: 760,
        padding: 32,
        background: '#ffffff',
        color: '#102a26',
        fontFamily: 'Inter, Arial, sans-serif',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          borderBottom: '2px solid #2f8f79',
          paddingBottom: 12,
          marginBottom: 22,
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700 }}>AI Assistant Report</div>
        <div style={{ fontSize: 11, color: '#5d746f' }}>{generatedAt.toLocaleString()}</div>
      </div>

      {question && (
        <div style={{ marginBottom: 20 }}>
          <div style={LABEL_STYLE}>Question</div>
          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{question}</div>
        </div>
      )}

      <div style={{ marginBottom: 20 }}>
        <div style={LABEL_STYLE}>Answer</div>
        <div className="markdown-body" style={{ fontSize: 13, lineHeight: 1.5 }}>
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{answer}</ReactMarkdown>
        </div>
      </div>

      {chartImages.map((chart) => (
        <div key={chart.title} style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>{chart.title}</div>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- report export, not a live page */}
          <img
            src={chart.dataUrl}
            style={{ width: '100%', display: 'block', border: '1px solid #e2e8f0', borderRadius: 8 }}
          />
        </div>
      ))}

      {provenance?.tools?.length > 0 && (
        <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid #e2e8f0', fontSize: 11, color: '#5d746f' }}>
          <div style={{ fontWeight: 600, color: '#102a26', marginBottom: 4 }}>Evidence used</div>
          <div>Sources: {provenance.tools.join(', ')}</div>
          {provenance.latest_data_timestamp && (
            <div>Latest evidence: {new Date(provenance.latest_data_timestamp).toLocaleString()}</div>
          )}
          {provenance.machine_ids?.length > 0 && (
            <div>
              Machines: {provenance.machine_ids.map((id) => `Machine-${String(id).padStart(3, '0')}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
