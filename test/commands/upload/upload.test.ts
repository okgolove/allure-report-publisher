import {runCommand} from '@oclif/test'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { globSync } from 'glob'

import {expect} from '../../support/setup.js'

describe('upload', () => {
  describe('help', () => {
    it('prints s3 upload command help', async () => {
      const {stdout} = await runCommand('upload s3 --help')
      expect(stdout).to.contain('Generate and upload allure report to s3 bucket')
    })

    it('prints gcs upload command help', async () => {
      const {stdout} = await runCommand('upload gcs --help')
      expect(stdout).to.contain('Generate and upload allure report to gcs bucket')
    })

    it('prints gitlab artifacts upload command help', async () => {
      const {stdout} = await runCommand('upload gitlab-artifacts --help')
      expect(stdout).to.contain('Generate report and output GitLab CI artifacts links')
    })
  })

  describe('s3', () => {
    let commandError: Error | undefined

    afterEach(function () {
      if (this.currentTest?.state === 'failed') {
        console.log('Command failed:', commandError?.message)
      }
    })

    it('runs s3 upload command', async function () {
      if (process.env.E2E_TEST !== 'true') return this.skip()

      const {AWS_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY} = process.env
      if (!AWS_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) throw new Error('Missing aws env variables')

      const prefix = `allure-report-publisher/${process.env.GITHUB_REF ?? 'local'}`
      const {stdout, error} = await runCommand([
        'upload',
        's3',
        `--results-glob=${process.env.ALLURE_RESULTS_GLOB ?? './**/allure-results'}`,
        '--config=allurerc.mjs',
        '--bucket=allure-reports',
        `--prefix=${prefix}`,
        '--update-pr=comment',
        '--ci-report-title=unit-test-report',
        '--report-name=unit-test-report',
        '--add-summary',
        '--collapse-summary',
        '--copy-latest',
        '--debug'
      ])
      commandError = error

      expect(error?.message).to.be.undefined
      expect(stdout).to.match(new RegExp(`${AWS_ENDPOINT}/allure-reports/${prefix}/[\\w/]+/index.html`))
    })
  })

  describe('executor.json', () => {
    let commandError: Error | undefined

    before(function () {
      if (process.env.E2E_TEST !== 'true') return this.skip()

      const { AWS_ENDPOINT, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env
      if (!AWS_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_ACCESS_KEY) {
        throw new Error('Missing aws env variables')
      }
    })

    afterEach(function () {
      if (this.currentTest?.state === 'failed') {
        console.log('Command failed:', commandError?.message)
      }
    })

    it('creates executor.json in allure-results directories', async function () {
      const { AWS_ENDPOINT } = process.env
      const resultsGlob = process.env.ALLURE_RESULTS_GLOB ?? './**/allure-results'
      const prefix = `allure-report-publisher/${process.env.GITHUB_REF ?? 'local'}/executor-json-test`

      const resultsDirs = globSync(resultsGlob, { absolute: true })
      if (resultsDirs.length === 0) throw new Error(`No allure-results directories found for glob: ${resultsGlob}`)

      const { error } = await runCommand([
        'upload',
        's3',
        `--results-glob=${process.env.ALLURE_RESULTS_GLOB ?? './**/allure-results'}`,
        '--config=allurerc.mjs',
        '--bucket=allure-reports',
        `--prefix=${prefix}`,
        '--debug'
      ])
      commandError = error

      expect(error?.message).to.be.undefined

      for (const resultsDir of resultsDirs) {
        const executorJsonPath = join(resultsDir, 'executor.json')

        expect(existsSync(executorJsonPath), `executor.json should exist at ${executorJsonPath}`).to.be.true

        const executorContent = JSON.parse(readFileSync(executorJsonPath, 'utf8'))

        // Validate executor.json structure and content
        expect(executorContent).to.have.property('name', 'GitHub')
        expect(executorContent).to.have.property('type', 'github')
        expect(executorContent).to.have.property('reportUrl')
        expect(executorContent.reportUrl).to.match(new RegExp(`${AWS_ENDPOINT}/allure-reports/${prefix}/[\\w/]+/index.html`))
        expect(executorContent).to.have.property('buildUrl')
        expect(executorContent).to.have.property('buildOrder')
        expect(executorContent).to.have.property('buildName')
      }
    })
  })
})
