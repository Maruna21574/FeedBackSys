// Demo data pre lokalny vyvoj a testovanie.
// Spustenie: npm run seed (vyčistí existujúce dáta a vytvorí demo admina, klienta a projekt).

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { generateBatchPdf } from "../src/services/pdf.service";

const prisma = new PrismaClient();

// Pevny token pre demo projekt, aby ho mohla public/demo/index.html stranka
// natvrdo odkazovat v <script data-project="..."> bez ohladu na opakovane seedovanie.
const DEMO_PROJECT_TOKEN = "demo7f3a9c2e8b1d4f6a0c5e9b2d7f1a4c8e0b3d6f9a2c5";

async function main() {
  // Poradie zmazania rešpektuje FK závislosti (cascade na FeedbackItem/InternalNote
  // sa spolieha len pri zmazaní Project, takže mažeme explicitne a v správnom poradí).
  await prisma.internalNote.deleteMany();
  await prisma.feedbackItem.deleteMany();
  await prisma.feedbackBatch.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  await prisma.client.deleteMany();

  const adminPassword = await bcrypt.hash("admin123", 10);
  const clientPassword = await bcrypt.hash("klient123", 10);

  const admin = await prisma.user.create({
    data: {
      name: "Admin",
      email: "admin@example.com",
      password: adminPassword,
      role: "admin",
    },
  });

  const client = await prisma.client.create({
    data: {
      name: "Demo s.r.o.",
      email: "klient@example.com",
      note: "Demo klient pre testovanie feedback nástroja.",
    },
  });

  await prisma.user.create({
    data: {
      name: "Demo Klient",
      email: "klient@example.com",
      password: clientPassword,
      role: "client",
      clientId: client.id,
    },
  });

  const project = await prisma.project.create({
    data: {
      clientId: client.id,
      name: "Demo web",
      url: "http://localhost:3000/demo/index.html",
      token: DEMO_PROJECT_TOKEN,
      status: "active",
    },
  });

  // Rozpracovane (este neodoslane) pripomienky - vznikli cez widget, ale klient
  // este nestlacil "Odoslat vsetky poznamky".
  await prisma.feedbackItem.createMany({
    data: [
      {
        projectId: project.id,
        url: project.url,
        pageTitle: "Demo web - Úvod",
        note: "Tlačidlo 'Kontaktujte nás' by malo byť výraznejšie - zvážte inú farbu.",
        xPosition: 860,
        yPosition: 540,
        viewportWidth: 1440,
        viewportHeight: 900,
        cssSelector: "#cta-button",
        status: "draft",
      },
      {
        projectId: project.id,
        url: project.url,
        pageTitle: "Demo web - Úvod",
        note: "V pätičke je preklep v slove 'kontakty'.",
        xPosition: 200,
        yPosition: 1180,
        viewportWidth: 1440,
        viewportHeight: 900,
        cssSelector: "footer p",
        status: "draft",
      },
    ],
  });

  // Uz odoslany batch (po "Odoslat vsetky poznamky") - vygeneroval PDF a email adminovi.
  const batch = await prisma.feedbackBatch.create({
    data: {
      projectId: project.id,
      clientId: client.id,
      totalItems: 4,
    },
  });

  const submittedAt = new Date();

  const newItem = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      url: project.url,
      pageTitle: "Demo web - Úvod",
      note: "Logo v hornej lište je príliš malé, zväčšiť aspoň o 20 %.",
      xPosition: 120,
      yPosition: 80,
      viewportWidth: 1440,
      viewportHeight: 900,
      cssSelector: "header .logo",
      status: "new",
      submittedBatchId: batch.id,
      submittedAt,
    },
  });

  const submittedItems = [newItem];

  const inProgressItem = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      url: project.url,
      pageTitle: "Demo web - Úvod",
      note: "Nadpis v hero sekcii je príliš dlhý, na mobile sa zalamuje nevhodne.",
      xPosition: 720,
      yPosition: 260,
      viewportWidth: 1440,
      viewportHeight: 900,
      cssSelector: ".hero h1",
      status: "in_progress",
      submittedBatchId: batch.id,
      submittedAt,
    },
  });

  const doneItem = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      url: project.url,
      pageTitle: "Demo web - Úvod",
      note: "Cenová tabuľka má príliš malé odsadenie medzi riadkami.",
      xPosition: 540,
      yPosition: 760,
      viewportWidth: 1440,
      viewportHeight: 900,
      cssSelector: ".pricing-table",
      status: "done",
      submittedBatchId: batch.id,
      submittedAt,
    },
  });

  const rejectedItem = await prisma.feedbackItem.create({
    data: {
      projectId: project.id,
      url: project.url,
      pageTitle: "Demo web - Úvod",
      note: "Navrhujeme zmeniť poradie sekcií - cenník by mal byť nižšie.",
      xPosition: 300,
      yPosition: 900,
      viewportWidth: 1440,
      viewportHeight: 900,
      cssSelector: "main",
      status: "rejected",
      submittedBatchId: batch.id,
      submittedAt,
    },
  });

  submittedItems.push(inProgressItem, doneItem, rejectedItem);

  await prisma.internalNote.create({
    data: {
      feedbackItemId: inProgressItem.id,
      userId: admin.id,
      note: "Pracujem na novom texte nadpisu, návrh poslem klientovi do konca týždňa.",
    },
  });

  const pdfFileName = await generateBatchPdf(submittedItems, project, client, batch.id);
  await prisma.feedbackBatch.update({ where: { id: batch.id }, data: { pdfPath: pdfFileName } });

  console.log("Seed dokončený.");
  console.log(`Admin prihlásenie: admin@example.com / admin123`);
  console.log(`Klient prihlásenie: klient@example.com / klient123`);
  console.log(`Projekt token: ${project.token}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
