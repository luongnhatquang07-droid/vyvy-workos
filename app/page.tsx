export default function Home() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        backgroundColor: '#ffffff',
        color: '#000000',
        padding: '2rem',
      }}
    >
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: '0 0 1rem' }}>
        VyVy WorkOS V2
      </h1>
      <p style={{ fontSize: '1rem', margin: '0 0 0.5rem', color: '#333333' }}>
        Nền tảng điều hành dự án mới đang được xây dựng.
      </p>
      <p style={{ fontSize: '0.875rem', color: '#666666' }}>
        Legacy application has been completely removed.
      </p>
    </main>
  )
}
