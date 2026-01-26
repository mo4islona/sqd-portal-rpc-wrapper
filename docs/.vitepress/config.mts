import { defineConfig } from 'vitepress';
import { withMermaid } from 'vitepress-plugin-mermaid';

export default withMermaid(
  defineConfig({
    title: 'SQD Portal RPC Wrapper',
    description: 'JSON-RPC 2.0 wrapper for SQD Portal EVM datasets',
    base: '/sqd-portal-rpc-wrapper/',

    head: [
      ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/sqd-portal-rpc-wrapper/favicon-32.png' }],
      ['link', { rel: 'icon', type: 'image/png', sizes: '128x128', href: '/sqd-portal-rpc-wrapper/logo-128.png' }],
      ['link', { rel: 'apple-touch-icon', href: '/sqd-portal-rpc-wrapper/logo-256.png' }]
    ],

    themeConfig: {
      logo: '/logo.png',

      nav: [
        { text: 'Guide', link: '/guide/getting-started' },
        { text: 'API', link: '/api/' },
        { text: 'Config', link: '/config/' },
        { text: 'Benchmarks', link: '/benchmarks/' },
        {
          text: 'Links',
          items: [
            { text: 'GitHub', link: 'https://github.com/0x666c6f/sqd-portal-rpc-wrapper' },
            { text: 'SQD Portal', link: 'https://beta.docs.sqd.dev/en/home' }
          ]
        }
      ],

      sidebar: {
        '/guide/': [
          {
            text: 'Introduction',
            items: [
              { text: 'Getting Started', link: '/guide/getting-started' },
              { text: 'Architecture', link: '/guide/architecture' }
            ]
          },
          {
            text: 'Deployment',
            items: [
              { text: 'Docker', link: '/guide/docker' },
              { text: 'Networks', link: '/guide/networks' }
            ]
          },
        {
          text: 'Development',
          items: [
            { text: 'Local Setup', link: '/guide/development' },
            { text: 'Observability', link: '/guide/observability' },
            { text: 'Benchmarking', link: '/guide/benchmarking' }
          ]
        }
        ],
        '/api/': [
          {
            text: 'JSON-RPC API',
            items: [
              { text: 'Overview', link: '/api/' },
              { text: 'Methods', link: '/api/methods' },
              { text: 'Errors', link: '/api/errors' },
              { text: 'Capabilities', link: '/api/capabilities' }
            ]
          }
        ],
        '/config/': [
          {
            text: 'Configuration',
            items: [
              { text: 'Overview', link: '/config/' },
              { text: 'Portal Settings', link: '/config/portal' },
              { text: 'Limits', link: '/config/limits' },
              { text: 'Security', link: '/config/security' }
            ]
          }
        ],
        '/benchmarks/': [
          {
            text: 'Benchmarks',
            items: [
              { text: 'Overview', link: '/benchmarks/' }
            ]
          }
        ]
      },

      socialLinks: [
        { icon: 'github', link: 'https://github.com/0x666c6f/sqd-portal-rpc-wrapper' }
      ],

      footer: {
        message: 'Released under the MIT License.',
        copyright: 'Copyright © 2026'
      },

      search: {
        provider: 'local'
      },

      editLink: {
        pattern: 'https://github.com/0x666c6f/sqd-portal-rpc-wrapper/edit/main/docs/:path',
        text: 'Edit this page on GitHub'
      }
    }
  })
);
