import type { Lesson } from '../types';

export const lesson: Lesson = {
  id: 'B12',
  part: 'B',
  title: 'Automation',
  summary:
    '150+ POPs par haath se config kyon nahi: templates aur variables, push, compliance aur drift, golden config; Ansible/Nornir, NETCONF/RESTCONF aur YANG ka parichay.',
  estMinutes: 40,
  blocks: [
    {
      kind: 'text',
      heading: 'Haath se config ki problem',
      body: 'Division mein 150+ POPs. Har ek par syslog, SNMP, NTP, AAA, banners, QoS policy… haath se type karoge to kahin typo, kahin line chhoot jaayegi, aur kisi ko pata nahi chalega. Automation teen kaam karta hai: (1) template se config banana, (2) sab devices par same tarike se lagana, (3) baad mein check karna ki koi badla to nahi (compliance / drift).',
    },
    { kind: 'widget', widget: 'template', caption: 'Ek template, teen routers' },
    {
      kind: 'table',
      caption: 'Tools ki duniya (parichay)',
      headers: ['Tool / tareeka', 'Kaise kaam karta hai', 'Note'],
      rows: [
        ['Ansible / Nornir', 'SSH se CLI commands, inventory + templates (Jinja2)', 'Sabse aam shuruaat'],
        ['NETCONF / RESTCONF', 'Structured data (XML/JSON) device API par', 'YANG model chahiye'],
        ['YANG', 'Config / state ka data model', 'Vendor + OpenConfig models'],
        ['Golden config / compliance', 'Har device ko standard se compare', 'Audit aur drift detection'],
        ['Streaming telemetry', 'Device khud data bhejta (gNMI)', 'Polling se tez'],
      ],
    },
    {
      kind: 'text',
      heading: 'RailMPLS Lab Automation tab',
      body: 'Bottom dock → Automation: inventory mein devices chuno, template likho ({{hostname}}, {{loopback}}, {{station}}, {{router_id}}), Preview, phir Push — lines wahi CLI chalti hai jo aap type karte, errors per device dikhte hain. Compliance rules: har line ek regex jo running-config mein honi chahiye; "!" se shuru = nahi honi chahiye (jaise "!^snmp-server community public").',
    },
    {
      kind: 'note',
      tone: 'safety',
      body: 'Automation galti ko bhi sab jagah ek saath fail karta hai. Pehle ek-do devices par try (canary), change window, rollback plan — aur safety circuits wale devices par change approved procedure se hi.',
    },
    {
      kind: 'note',
      tone: 'info',
      body: 'Simulator: Automation tab ek teaching tool hai (Ansible jaisa) — inventory file, idempotency engine, rollback ya NETCONF nahi. Compliance running-config par regex hai.',
    },
    {
      kind: 'analogy',
      body: 'Template = standard station working rule ka format: har station par same dhaancha, sirf station ka naam / code alag bharte hain. Compliance = inspection jo check kare ki station ne format badla to nahi.',
    },
  ],
  flash: [
    {
      prompt: 'Configuration drift kya hai?',
      options: ['Clock drift', 'Device config standard se hat gaya', 'Fibre loss', 'Label badalna'],
      correctIndex: 1,
      explanation: 'Compliance check se pakda jaata hai.',
    },
    {
      prompt: '{{loopback}} jaisa variable kyon?',
      options: ['Sundar dikhe', 'Ek template sab devices ke liye, values per device', 'SNMP ke liye', 'Zaroori nahi'],
      correctIndex: 1,
      explanation: 'Template + variables = consistent config.',
    },
    {
      prompt: 'YANG kya hai?',
      options: ['Ek routing protocol', 'Config/state ka data model', 'Ek encryption', 'Ek cable'],
      correctIndex: 1,
      explanation: 'NETCONF/RESTCONF YANG models use karte hain.',
    },
    {
      prompt: 'Naya template 150 routers par push karne se pehle?',
      options: ['Seedha sab par', 'Pehle 1–2 devices par (canary) aur rollback plan', 'Kuch nahi', 'Reboot'],
      correctIndex: 1,
      explanation: 'Galti ka asar chhota rakho.',
    },
    {
      prompt: 'Compliance rule "!^snmp-server community public" ka matlab?',
      options: ['Line honi chahiye', 'Aisi line nahi honi chahiye', 'Comment', 'Error'],
      correctIndex: 1,
      explanation: '"!" = must not exist.',
    },
  ],
  glossary: [
    { term: 'Template', en: 'Config text with variables rendered per device.', hi: 'Variables wala config format.' },
    { term: 'Compliance', en: 'Checking configs against a standard (golden config).', hi: 'Standard se milaan.' },
    { term: 'Drift', en: 'Unplanned difference between a device and its standard config.', hi: 'Config ka bhatakna.' },
    { term: 'NETCONF / YANG', en: 'Model-driven device configuration protocol and data-model language.', hi: 'Structured config ka tareeka.' },
    { term: 'Canary', en: 'Trying a change on a few devices first.', hi: 'Pehle chhote hisse par test.' },
  ],
  practice: { labId: 'LB12.1', note: 'Lab LB12.1: chaar LSRs par management baseline push karo aur drift theek karo.' },
};
